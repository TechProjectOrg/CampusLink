import type { Router } from 'express';
import prisma from '../prisma';
import { probeRedisHealth } from './cache';

type ServiceState = 'healthy' | 'degraded' | 'unavailable' | 'unconfigured';
type RouteStatus = 'healthy' | 'degraded' | 'unavailable';

type RouteDependency = 'database' | 'redis';
type RouteModuleName =
  | 'system'
  | 'auth'
  | 'posts'
  | 'users'
  | 'search'
  | 'network'
  | 'notifications'
  | 'chat'
  | 'clubs'
  | 'group-chat'
  | 'admin';

export type RouteDescriptor = {
  module: RouteModuleName;
  prefix: string;
  router: Router;
  requiredDependencies: RouteDependency[];
  optionalDependencies?: RouteDependency[];
};

type ExpressRoute = {
  method: string;
  path: string;
  module: RouteModuleName;
  requiredDependencies: RouteDependency[];
  optionalDependencies: RouteDependency[];
};

type ServiceHealthSnapshot = {
  server: ServiceState;
  database: ServiceState;
  redis: ServiceState;
  databaseLatencyMs: number | null;
};

type RouteHealthSummary = {
  total: number;
  healthy: number;
  degraded: number;
  unavailable: number;
};

type RouteHealthItem = ExpressRoute & {
  status: RouteStatus;
};

export type HealthReport = {
  status: RouteStatus;
  timestamp: string;
  uptimeSeconds: number;
  services: ServiceHealthSnapshot;
  summary: RouteHealthSummary;
  routes: RouteHealthItem[];
};

export type StaticRouteDescriptor = {
  method: string;
  path: string;
  module: RouteModuleName;
  requiredDependencies: RouteDependency[];
  optionalDependencies?: RouteDependency[];
};

function normalizePath(path: string): string {
  const compact = path.replace(/\/+/g, '/');
  if (compact === '/' || compact === '') {
    return '/';
  }

  return compact.endsWith('/') ? compact.slice(0, -1) : compact;
}

function joinPaths(prefix: string, path: string): string {
  if (!prefix || prefix === '/') {
    return normalizePath(path || '/');
  }

  if (!path || path === '/') {
    return normalizePath(prefix);
  }

  return normalizePath(`${prefix}/${path}`);
}

function getRoutePaths(routePath: unknown): string[] {
  if (Array.isArray(routePath)) {
    return routePath.flatMap((entry) => getRoutePaths(entry));
  }

  if (typeof routePath === 'string') {
    return [routePath];
  }

  return [];
}

function collectRouterRoutes(
  router: Router,
  prefix: string,
  module: RouteModuleName,
  requiredDependencies: RouteDependency[],
  optionalDependencies: RouteDependency[] = [],
): ExpressRoute[] {
  const stack = ((router as unknown as { stack?: unknown[] }).stack ?? []) as Array<{
    route?: {
      path?: unknown;
      methods?: Record<string, boolean>;
    };
    handle?: Router;
  }>;

  const routes: ExpressRoute[] = [];

  for (const layer of stack) {
    if (layer.route) {
      const methods = Object.entries(layer.route.methods ?? {})
        .filter(([, enabled]) => enabled)
        .map(([method]) => method.toUpperCase());
      const paths = getRoutePaths(layer.route.path);

      for (const method of methods) {
        for (const path of paths) {
          routes.push({
            method,
            path: joinPaths(prefix, path),
            module,
            requiredDependencies: [...requiredDependencies],
            optionalDependencies: [...optionalDependencies],
          });
        }
      }
      continue;
    }

    const nestedStack = ((layer.handle as unknown as { stack?: unknown[] } | undefined)?.stack ?? []) as unknown[];
    if (nestedStack.length > 0) {
      routes.push(...collectRouterRoutes(layer.handle as Router, prefix, module, requiredDependencies, optionalDependencies));
    }
  }

  return routes;
}

function buildRoutes(descriptors: RouteDescriptor[], staticRoutes: StaticRouteDescriptor[]): ExpressRoute[] {
  const normalizedStaticRoutes: ExpressRoute[] = staticRoutes.map((route) => ({
    method: route.method,
    path: normalizePath(route.path),
    module: route.module,
    requiredDependencies: [...route.requiredDependencies],
    optionalDependencies: [...(route.optionalDependencies ?? [])],
  }));

  return descriptors
    .flatMap((descriptor) =>
      collectRouterRoutes(
        descriptor.router,
        descriptor.prefix,
        descriptor.module,
        descriptor.requiredDependencies,
        descriptor.optionalDependencies ?? [],
      ),
    )
    .concat(normalizedStaticRoutes)
    .sort((left, right) => {
      if (left.path === right.path) {
        return left.method.localeCompare(right.method);
      }
      return left.path.localeCompare(right.path);
    });
}

async function probeDatabaseHealth(): Promise<{ status: ServiceState; latencyMs: number | null }> {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: 'healthy',
      latencyMs: Date.now() - startedAt,
    };
  } catch {
    return {
      status: 'unavailable',
      latencyMs: null,
    };
  }
}

function toRouteStatus(route: ExpressRoute, services: ServiceHealthSnapshot): RouteStatus {
  for (const dependency of route.requiredDependencies) {
    const dependencyStatus = services[dependency];
    if (dependencyStatus === 'unavailable') {
      return 'unavailable';
    }
    if (dependencyStatus === 'degraded') {
      return 'degraded';
    }
  }

  for (const dependency of route.optionalDependencies) {
    const dependencyStatus = services[dependency];
    if (dependencyStatus === 'unavailable' || dependencyStatus === 'degraded') {
      return 'degraded';
    }
  }

  return 'healthy';
}

export async function buildHealthReport(
  descriptors: RouteDescriptor[],
  staticRoutes: StaticRouteDescriptor[] = [],
): Promise<HealthReport> {
  const [database, redis] = await Promise.all([probeDatabaseHealth(), probeRedisHealth()]);

  const services: ServiceHealthSnapshot = {
    server: 'healthy',
    database: database.status,
    redis,
    databaseLatencyMs: database.latencyMs,
  };

  const routes = buildRoutes(descriptors, staticRoutes).map((route) => ({
    ...route,
    status: toRouteStatus(route, services),
  }));

  const summary = routes.reduce<RouteHealthSummary>(
    (accumulator, route) => {
      accumulator.total += 1;
      accumulator[route.status] += 1;
      return accumulator;
    },
    {
      total: 0,
      healthy: 0,
      degraded: 0,
      unavailable: 0,
    },
  );

  const overallStatus: RouteStatus =
    services.database === 'unavailable'
      ? 'unavailable'
      : routes.some((route) => route.status === 'degraded')
        ? 'degraded'
        : 'healthy';

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    services,
    summary,
    routes,
  };
}
