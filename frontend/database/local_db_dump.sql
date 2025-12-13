--
-- PostgreSQL database dump
--

\restrict NyhctK2JWjVoh1yZ98D4RpKLBSFzhDnehtAJlvuuaMnbNDqKV7jVGSPK9fmUjYZ

-- Dumped from database version 18.0
-- Dumped by pg_dump version 18.0

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: get_posts_by_hashtag(character varying, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_posts_by_hashtag(p_tag_name character varying, p_limit integer DEFAULT 50) RETURNS TABLE(post_id uuid, user_id uuid, username character varying, content_text text, created_at timestamp without time zone, like_count bigint)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.post_id,
        p.user_id,
        u.username,
        p.content_text,
        p.created_at,
        (SELECT COUNT(*) FROM Likes l WHERE l.post_id = p.post_id) as like_count
    FROM Posts p
    JOIN Users u ON p.user_id = u.user_id
    JOIN PostTags pt ON p.post_id = pt.post_id
    JOIN Hashtags h ON pt.tag_id = h.tag_id
    WHERE h.tag_name = p_tag_name
    AND u.is_public = TRUE
    ORDER BY p.created_at DESC
    LIMIT p_limit;
END;
$$;


ALTER FUNCTION public.get_posts_by_hashtag(p_tag_name character varying, p_limit integer) OWNER TO postgres;

--
-- Name: get_user_timeline(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_user_timeline(p_user_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS TABLE(post_id uuid, user_id uuid, username character varying, profile_picture_url character varying, content_text text, media_url character varying, media_type character varying, view_count integer, created_at timestamp without time zone, like_count bigint, comment_count bigint, is_liked boolean)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.post_id,
        p.user_id,
        u.username,
        u.profile_picture_url,
        p.content_text,
        p.media_url,
        p.media_type,
        p.view_count,
        p.created_at,
        (SELECT COUNT(*) FROM Likes l WHERE l.post_id = p.post_id) as like_count,
        (SELECT COUNT(*) FROM Comments c WHERE c.post_id = p.post_id) as comment_count,
        EXISTS(SELECT 1 FROM Likes l WHERE l.post_id = p.post_id AND l.user_id = p_user_id) as is_liked
    FROM Posts p
    JOIN Users u ON p.user_id = u.user_id
    WHERE p.user_id IN (
        SELECT followee_id FROM Follows WHERE follower_id = p_user_id
        UNION
        SELECT p_user_id
    )
    AND (u.is_public = TRUE OR p.user_id = p_user_id OR 
         EXISTS(SELECT 1 FROM Follows WHERE follower_id = p_user_id AND followee_id = p.user_id))
    ORDER BY p.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;


ALTER FUNCTION public.get_user_timeline(p_user_id uuid, p_limit integer, p_offset integer) OWNER TO postgres;

--
-- Name: prevent_self_interaction(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.prevent_self_interaction() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_TABLE_NAME = 'Follows' THEN
        IF NEW.follower_id = NEW.followee_id THEN
            RAISE EXCEPTION 'Users cannot follow themselves';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.prevent_self_interaction() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: comments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.comments (
    comment_id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    user_id uuid NOT NULL,
    parent_comment_id uuid,
    content character varying(500) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.comments OWNER TO postgres;

--
-- Name: follows; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.follows (
    follower_id uuid NOT NULL,
    followee_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT follows_check CHECK ((follower_id <> followee_id))
);


ALTER TABLE public.follows OWNER TO postgres;

--
-- Name: hashtags; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.hashtags (
    tag_id uuid DEFAULT gen_random_uuid() NOT NULL,
    tag_name character varying(100) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.hashtags OWNER TO postgres;

--
-- Name: likes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.likes (
    user_id uuid NOT NULL,
    post_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.likes OWNER TO postgres;

--
-- Name: posts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.posts (
    post_id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    content_text text,
    media_url character varying(255),
    media_type character varying(10),
    view_count integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.posts OWNER TO postgres;

--
-- Name: posttags; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.posttags (
    post_id uuid NOT NULL,
    tag_id uuid NOT NULL
);


ALTER TABLE public.posttags OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    user_id uuid DEFAULT gen_random_uuid() NOT NULL,
    username character varying(50) NOT NULL,
    email character varying(100) NOT NULL,
    password_hash character(64) NOT NULL,
    bio character varying(500),
    profile_picture_url character varying(255),
    is_public boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: userfeed; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.userfeed AS
 SELECT p.post_id,
    p.user_id,
    u.username,
    u.profile_picture_url,
    p.content_text,
    p.media_url,
    p.media_type,
    p.view_count,
    p.created_at,
    ( SELECT count(*) AS count
           FROM public.likes l
          WHERE (l.post_id = p.post_id)) AS like_count,
    ( SELECT count(*) AS count
           FROM public.comments c
          WHERE (c.post_id = p.post_id)) AS comment_count
   FROM (public.posts p
     JOIN public.users u ON ((p.user_id = u.user_id)));


ALTER VIEW public.userfeed OWNER TO postgres;

--
-- Name: userstats; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.userstats AS
 SELECT user_id,
    username,
    ( SELECT count(*) AS count
           FROM public.follows f
          WHERE (f.follower_id = u.user_id)) AS following_count,
    ( SELECT count(*) AS count
           FROM public.follows f
          WHERE (f.followee_id = u.user_id)) AS follower_count,
    ( SELECT count(*) AS count
           FROM public.posts p
          WHERE (p.user_id = u.user_id)) AS post_count
   FROM public.users u;


ALTER VIEW public.userstats OWNER TO postgres;

--
-- Data for Name: comments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.comments (comment_id, post_id, user_id, parent_comment_id, content, created_at) FROM stdin;
646613f2-5a76-4f0f-b7f4-f83fd48e4175	1160f43b-e85d-4412-a789-3b19f37acfdd	75f379e2-bf84-49c2-bc5c-459d7d4bc0c7	\N	Looks great! What tech stack did you use?	2025-11-04 21:44:50.332499
9385dbf1-ecbb-429f-bd03-e7a8b4324f91	1160f43b-e85d-4412-a789-3b19f37acfdd	443ed493-3976-493d-87dc-fe09aeacf0bd	\N	Impressive work! 👏	2025-11-04 21:44:50.332499
31ea13a5-cebc-41cf-bbd2-45ed3f9b62d2	793e2036-9eda-4301-bbc0-99ac21309ae1	751afb58-ff2b-4128-9f4c-17477a6c6906	\N	Beautiful colors! Love your style.	2025-11-04 21:44:50.332499
698f3012-8440-43cb-a942-39f116954d08	9a101651-1256-4540-90d9-cb4958c4baf9	751afb58-ff2b-4128-9f4c-17477a6c6906	\N	Stunning! I need to visit Bali someday.	2025-11-04 21:44:50.332499
cc30aa8f-4c98-4aca-a5c8-4b6ee48e2a72	9a101651-1256-4540-90d9-cb4958c4baf9	75f379e2-bf84-49c2-bc5c-459d7d4bc0c7	\N	Absolutely gorgeous! 😍	2025-11-04 21:44:50.332499
\.


--
-- Data for Name: follows; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.follows (follower_id, followee_id, created_at) FROM stdin;
751afb58-ff2b-4128-9f4c-17477a6c6906	75f379e2-bf84-49c2-bc5c-459d7d4bc0c7	2025-11-04 21:44:50.332499
751afb58-ff2b-4128-9f4c-17477a6c6906	443ed493-3976-493d-87dc-fe09aeacf0bd	2025-11-04 21:44:50.332499
75f379e2-bf84-49c2-bc5c-459d7d4bc0c7	751afb58-ff2b-4128-9f4c-17477a6c6906	2025-11-04 21:44:50.332499
75f379e2-bf84-49c2-bc5c-459d7d4bc0c7	443ed493-3976-493d-87dc-fe09aeacf0bd	2025-11-04 21:44:50.332499
443ed493-3976-493d-87dc-fe09aeacf0bd	751afb58-ff2b-4128-9f4c-17477a6c6906	2025-11-04 21:44:50.332499
443ed493-3976-493d-87dc-fe09aeacf0bd	75f379e2-bf84-49c2-bc5c-459d7d4bc0c7	2025-11-04 21:44:50.332499
\.


--
-- Data for Name: hashtags; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.hashtags (tag_id, tag_name, created_at) FROM stdin;
ed55aa0c-b613-4fb5-9fa5-13552b0b71e5	coding	2025-11-04 21:44:50.332499
c228a8ad-841e-4493-b4c2-2699398af69a	webdev	2025-11-04 21:44:50.332499
57730b2e-6d51-4c51-a48d-d9cf93741ce1	travel	2025-11-04 21:44:50.332499
ea617af4-343c-4119-9cca-a9a588db6a59	sunset	2025-11-04 21:44:50.332499
c70bc35d-c078-4239-b065-866db094d6bb	art	2025-11-04 21:44:50.332499
d2231ca3-1288-4427-8822-0050add7224d	photography	2025-11-04 21:44:50.332499
\.


--
-- Data for Name: likes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.likes (user_id, post_id, created_at) FROM stdin;
75f379e2-bf84-49c2-bc5c-459d7d4bc0c7	1160f43b-e85d-4412-a789-3b19f37acfdd	2025-11-04 21:44:50.332499
443ed493-3976-493d-87dc-fe09aeacf0bd	1160f43b-e85d-4412-a789-3b19f37acfdd	2025-11-04 21:44:50.332499
751afb58-ff2b-4128-9f4c-17477a6c6906	793e2036-9eda-4301-bbc0-99ac21309ae1	2025-11-04 21:44:50.332499
443ed493-3976-493d-87dc-fe09aeacf0bd	793e2036-9eda-4301-bbc0-99ac21309ae1	2025-11-04 21:44:50.332499
751afb58-ff2b-4128-9f4c-17477a6c6906	9a101651-1256-4540-90d9-cb4958c4baf9	2025-11-04 21:44:50.332499
75f379e2-bf84-49c2-bc5c-459d7d4bc0c7	9a101651-1256-4540-90d9-cb4958c4baf9	2025-11-04 21:44:50.332499
\.


--
-- Data for Name: posts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.posts (post_id, user_id, content_text, media_url, media_type, view_count, created_at) FROM stdin;
1160f43b-e85d-4412-a789-3b19f37acfdd	751afb58-ff2b-4128-9f4c-17477a6c6906	Just finished a new coding project! #coding #webdev	\N	\N	45	2025-11-04 21:44:50.332499
793e2036-9eda-4301-bbc0-99ac21309ae1	75f379e2-bf84-49c2-bc5c-459d7d4bc0c7	New digital artwork! What do you think? 🎨	https://example.com/art1.jpg	image	120	2025-11-04 21:44:50.332499
9a101651-1256-4540-90d9-cb4958c4baf9	443ed493-3976-493d-87dc-fe09aeacf0bd	Amazing sunset in Bali! #travel #sunset	https://example.com/bali.jpg	image	230	2025-11-04 21:44:50.332499
\.


--
-- Data for Name: posttags; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.posttags (post_id, tag_id) FROM stdin;
1160f43b-e85d-4412-a789-3b19f37acfdd	ed55aa0c-b613-4fb5-9fa5-13552b0b71e5
1160f43b-e85d-4412-a789-3b19f37acfdd	c228a8ad-841e-4493-b4c2-2699398af69a
9a101651-1256-4540-90d9-cb4958c4baf9	57730b2e-6d51-4c51-a48d-d9cf93741ce1
9a101651-1256-4540-90d9-cb4958c4baf9	ea617af4-343c-4119-9cca-a9a588db6a59
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (user_id, username, email, password_hash, bio, profile_picture_url, is_public, created_at) FROM stdin;
751afb58-ff2b-4128-9f4c-17477a6c6906	john_doe	john@example.com	5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8	Software developer and tech enthusiast	\N	t	2025-11-04 21:44:42.635287
75f379e2-bf84-49c2-bc5c-459d7d4bc0c7	jane_smith	jane@example.com	6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b	Digital artist and photographer	\N	t	2025-11-04 21:44:42.635287
83f5568d-bef7-4fa7-aebb-330e7aca34a8	alex_wilson	alex@example.com	d4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35	Music lover and content creator	\N	f	2025-11-04 21:44:42.635287
443ed493-3976-493d-87dc-fe09aeacf0bd	sarah_lee	sarah@example.com	4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce	Travel blogger exploring the world	\N	t	2025-11-04 21:44:42.635287
\.


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (comment_id);


--
-- Name: follows follows_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_pkey PRIMARY KEY (follower_id, followee_id);


--
-- Name: hashtags hashtags_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hashtags
    ADD CONSTRAINT hashtags_pkey PRIMARY KEY (tag_id);


--
-- Name: hashtags hashtags_tag_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hashtags
    ADD CONSTRAINT hashtags_tag_name_key UNIQUE (tag_name);


--
-- Name: likes likes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.likes
    ADD CONSTRAINT likes_pkey PRIMARY KEY (user_id, post_id);


--
-- Name: posts posts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_pkey PRIMARY KEY (post_id);


--
-- Name: posttags posttags_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.posttags
    ADD CONSTRAINT posttags_pkey PRIMARY KEY (post_id, tag_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: idx_comment_parent_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_comment_parent_id ON public.comments USING btree (parent_comment_id);


--
-- Name: idx_comment_post_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_comment_post_id ON public.comments USING btree (post_id, created_at);


--
-- Name: idx_followee_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_followee_id ON public.follows USING btree (followee_id);


--
-- Name: idx_follower_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_follower_id ON public.follows USING btree (follower_id);


--
-- Name: idx_like_post_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_like_post_id ON public.likes USING btree (post_id);


--
-- Name: idx_post_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_post_created_at ON public.posts USING btree (created_at DESC);


--
-- Name: idx_post_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_post_user_id ON public.posts USING btree (user_id, created_at DESC);


--
-- Name: idx_posttag_tag_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_posttag_tag_id ON public.posttags USING btree (tag_id);


--
-- Name: idx_tag_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tag_name ON public.hashtags USING btree (tag_name);


--
-- Name: idx_user_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_email ON public.users USING btree (email);


--
-- Name: idx_user_username; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_username ON public.users USING btree (username);


--
-- Name: follows check_self_follow; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER check_self_follow BEFORE INSERT OR UPDATE ON public.follows FOR EACH ROW EXECUTE FUNCTION public.prevent_self_interaction();


--
-- Name: comments comments_parent_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_parent_comment_id_fkey FOREIGN KEY (parent_comment_id) REFERENCES public.comments(comment_id) ON DELETE CASCADE;


--
-- Name: comments comments_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(post_id) ON DELETE CASCADE;


--
-- Name: comments comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: follows follows_followee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_followee_id_fkey FOREIGN KEY (followee_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: follows follows_follower_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: likes likes_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.likes
    ADD CONSTRAINT likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(post_id) ON DELETE CASCADE;


--
-- Name: likes likes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.likes
    ADD CONSTRAINT likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: posts posts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: posttags posttags_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.posttags
    ADD CONSTRAINT posttags_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(post_id) ON DELETE CASCADE;


--
-- Name: posttags posttags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.posttags
    ADD CONSTRAINT posttags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.hashtags(tag_id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict NyhctK2JWjVoh1yZ98D4RpKLBSFzhDnehtAJlvuuaMnbNDqKV7jVGSPK9fmUjYZ

