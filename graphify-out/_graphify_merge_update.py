import sys, json
from graphify.build import build_from_json
import networkx as nx
from pathlib import Path

# Backup old graph
if Path('graphify-out/graph.json').exists():
    Path('graphify-out/.graphify_old.json').write_text(Path('graphify-out/graph.json').read_text())

existing_data = json.loads(Path('graphify-out/graph.json').read_text()) if Path('graphify-out/graph.json').exists() else {'nodes':[], 'edges':[]}

# Build existing graph manually from nodes/edges format
G_existing = nx.Graph()
for n in existing_data.get('nodes', []):
    nid = n.get('id')
    attrs = dict(n)
    attrs.pop('id', None)
    G_existing.add_node(nid, **attrs)
for e in existing_data.get('edges', []):
    src = e.get('source') or e.get('_src')
    tgt = e.get('target') or e.get('_tgt')
    attrs = dict(e)
    # remove duplicate keys
    attrs.pop('source', None)
    attrs.pop('target', None)
    attrs.pop('_src', None)
    attrs.pop('_tgt', None)
    if src and tgt:
        G_existing.add_edge(src, tgt, **attrs)

new_extraction = json.loads(Path('graphify-out/.graphify_extract.json').read_text())
G_new = build_from_json(new_extraction)

# Prune nodes from deleted files (if any)
incremental = json.loads(Path('graphify-out/.graphify_incremental.json').read_text()) if Path('graphify-out/.graphify_incremental.json').exists() else {}
deleted = set(incremental.get('deleted_files', []))
if deleted:
    to_remove = [n for n, d in G_existing.nodes(data=True) if d.get('source_file') in deleted]
    G_existing.remove_nodes_from(to_remove)
    print(f'Pruned {len(to_remove)} ghost nodes from {len(deleted)} deleted file(s)')

# Merge: new nodes/edges into existing graph
G_existing.update(G_new)
print(f'Merged: {G_existing.number_of_nodes()} nodes, {G_existing.number_of_edges()} edges')

# Write merged result back to .graphify_extract.json so Step 4 sees the full graph
merged_out = {
    'nodes': [{'id': n, **d} for n, d in G_existing.nodes(data=True)],
    'edges': [{'source': u, 'target': v, **d} for u, v, d in G_existing.edges(data=True)],
    'hyperedges': new_extraction.get('hyperedges', []),
    'input_tokens': new_extraction.get('input_tokens', 0),
    'output_tokens': new_extraction.get('output_tokens', 0),
}
Path('graphify-out/.graphify_extract.json').write_text(json.dumps(merged_out, indent=2))
print(f'[graphify update] Merged extraction written ({len(merged_out["nodes"])} nodes, {len(merged_out["edges"])} edges)')
