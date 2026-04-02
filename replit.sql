--
-- PostgreSQL database dump
--

\restrict XhFF8ak5X1X3Uc6VjulfY8Ta23DgVXWq5Wa8qK5lBphULHzE4IdAEo9MCdwidWd

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id integer NOT NULL,
    clinician_id integer,
    staff_id integer,
    action character varying(100) NOT NULL,
    resource_type character varying(50),
    resource_id integer,
    patient_id integer,
    ip_address character varying(45),
    user_agent text,
    details jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: clinician_staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinician_staff (
    id integer NOT NULL,
    clinician_id integer NOT NULL,
    email character varying(255) NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    role character varying(50) DEFAULT 'staff'::character varying NOT NULL,
    password_hash character varying(255),
    invite_token character varying(255),
    invite_expires timestamp without time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    login_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamp without time zone
);


--
-- Name: clinician_staff_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinician_staff_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinician_staff_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinician_staff_id_seq OWNED BY public.clinician_staff.id;


--
-- Name: lab_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lab_results (
    id integer NOT NULL,
    patient_id integer NOT NULL,
    lab_date timestamp without time zone NOT NULL,
    lab_values jsonb NOT NULL,
    interpretation_result jsonb,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: lab_results_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lab_results_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lab_results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lab_results_id_seq OWNED BY public.lab_results.id;


--
-- Name: patient_portal_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_portal_accounts (
    id integer NOT NULL,
    patient_id integer NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255),
    invite_token character varying(255),
    invite_expires timestamp without time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    password_reset_token character varying(255),
    password_reset_expires timestamp without time zone,
    last_login_at timestamp without time zone
);


--
-- Name: patient_portal_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.patient_portal_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: patient_portal_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.patient_portal_accounts_id_seq OWNED BY public.patient_portal_accounts.id;


--
-- Name: patients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patients (
    id integer NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    date_of_birth timestamp without time zone,
    mrn character varying(50),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    gender character varying(10) DEFAULT 'male'::character varying NOT NULL,
    user_id integer,
    email character varying(255),
    phone character varying(30)
);


--
-- Name: patients_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.patients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: patients_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.patients_id_seq OWNED BY public.patients.id;


--
-- Name: portal_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portal_messages (
    id integer NOT NULL,
    patient_id integer NOT NULL,
    clinician_id integer NOT NULL,
    sender_type character varying(20) NOT NULL,
    content text NOT NULL,
    read_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    external_message_id character varying(100)
);


--
-- Name: portal_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.portal_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: portal_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.portal_messages_id_seq OWNED BY public.portal_messages.id;


--
-- Name: published_protocols; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.published_protocols (
    id integer NOT NULL,
    patient_id integer NOT NULL,
    lab_result_id integer,
    clinician_id integer NOT NULL,
    supplements jsonb NOT NULL,
    clinician_notes text,
    lab_date timestamp without time zone,
    published_at timestamp without time zone DEFAULT now() NOT NULL,
    dietary_guidance text,
    first_viewed_at timestamp without time zone
);


--
-- Name: published_protocols_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.published_protocols_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: published_protocols_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.published_protocols_id_seq OWNED BY public.published_protocols.id;


--
-- Name: saved_interpretations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_interpretations (
    id integer NOT NULL,
    patient_name character varying(200) NOT NULL,
    gender character varying(10) NOT NULL,
    lab_date timestamp without time zone DEFAULT now() NOT NULL,
    lab_values jsonb NOT NULL,
    interpretation jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    user_id integer
);


--
-- Name: saved_interpretations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.saved_interpretations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saved_interpretations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.saved_interpretations_id_seq OWNED BY public.saved_interpretations.id;


--
-- Name: saved_recipes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_recipes (
    id integer NOT NULL,
    patient_id integer NOT NULL,
    food_name text NOT NULL,
    recipe_name text NOT NULL,
    recipe_data jsonb NOT NULL,
    saved_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: saved_recipes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.saved_recipes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saved_recipes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.saved_recipes_id_seq OWNED BY public.saved_recipes.id;


--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


--
-- Name: supplement_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplement_orders (
    id integer NOT NULL,
    patient_id integer NOT NULL,
    clinician_id integer NOT NULL,
    items jsonb NOT NULL,
    subtotal text NOT NULL,
    status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    patient_notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: supplement_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.supplement_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: supplement_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.supplement_orders_id_seq OWNED BY public.supplement_orders.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    username character varying(100) NOT NULL,
    password_hash character varying(255) NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    title character varying(50) NOT NULL,
    npi character varying(20),
    clinic_name character varying(200) NOT NULL,
    phone character varying(30),
    address text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    role character varying(20) DEFAULT 'clinician'::character varying NOT NULL,
    subscription_status character varying(30) DEFAULT 'active'::character varying NOT NULL,
    notes text,
    password_reset_token character varying(255),
    password_reset_expires timestamp without time zone,
    messaging_preference character varying(20) DEFAULT 'none'::character varying NOT NULL,
    messaging_phone character varying(30),
    external_messaging_provider character varying(30),
    external_messaging_api_key text,
    external_messaging_channel_id character varying(100),
    external_messaging_webhook_secret character varying(100),
    login_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamp without time zone
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: clinician_staff id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinician_staff ALTER COLUMN id SET DEFAULT nextval('public.clinician_staff_id_seq'::regclass);


--
-- Name: lab_results id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_results ALTER COLUMN id SET DEFAULT nextval('public.lab_results_id_seq'::regclass);


--
-- Name: patient_portal_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_portal_accounts ALTER COLUMN id SET DEFAULT nextval('public.patient_portal_accounts_id_seq'::regclass);


--
-- Name: patients id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patients ALTER COLUMN id SET DEFAULT nextval('public.patients_id_seq'::regclass);


--
-- Name: portal_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_messages ALTER COLUMN id SET DEFAULT nextval('public.portal_messages_id_seq'::regclass);


--
-- Name: published_protocols id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.published_protocols ALTER COLUMN id SET DEFAULT nextval('public.published_protocols_id_seq'::regclass);


--
-- Name: saved_interpretations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_interpretations ALTER COLUMN id SET DEFAULT nextval('public.saved_interpretations_id_seq'::regclass);


--
-- Name: saved_recipes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_recipes ALTER COLUMN id SET DEFAULT nextval('public.saved_recipes_id_seq'::regclass);


--
-- Name: supplement_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplement_orders ALTER COLUMN id SET DEFAULT nextval('public.supplement_orders_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_logs (id, clinician_id, staff_id, action, resource_type, resource_id, patient_id, ip_address, user_agent, details, created_at) FROM stdin;
\.


--
-- Data for Name: clinician_staff; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.clinician_staff (id, clinician_id, email, first_name, last_name, role, password_hash, invite_token, invite_expires, is_active, created_at, login_attempts, locked_until) FROM stdin;
1	3	alice.nurse.test2026@example.com	Alice	Nurse	staff	\N	cb3d91e54695dff2f623075d31537e30bf366363f252708a1d47492e98233314	2026-03-29 16:00:49.137	t	2026-03-26 16:00:49.139524	0	\N
\.


--
-- Data for Name: lab_results; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.lab_results (id, patient_id, lab_date, lab_values, interpretation_result, notes, created_at, updated_at) FROM stdin;
2	4	2026-03-01 00:00:00	{"a1c": "5.5", "hdl": "55", "ldl": "120", "tsh": "2.5", "freeT4": "1.2", "vitaminD": "35", "hematocrit": "39", "hemoglobin": "13", "patientName": "Test Trend", "triglycerides": "150", "fastingGlucose": "95", "totalCholesterol": "200"}	{"redFlags": [], "supplements": [], "interpretations": []}	\N	2026-03-11 13:08:45.280577	2026-03-11 13:08:45.280577
\.


--
-- Data for Name: patient_portal_accounts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.patient_portal_accounts (id, patient_id, email, password_hash, invite_token, invite_expires, is_active, created_at, password_reset_token, password_reset_expires, last_login_at) FROM stdin;
1	7	portalpatient@test.com	$2b$12$u04xK3iZA75j2TX966hXMOzPsWjbMqmClR1wM4RK9t0MMDbpGqAS6	ec248856840e00d7b608a97463427b1eff3d11790b2de6fbfb5d7ec8d4418ac2	2026-03-29 14:55:06.063	t	2026-03-26 14:51:38.544964	\N	\N	\N
\.


--
-- Data for Name: patients; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.patients (id, first_name, last_name, date_of_birth, mrn, created_at, updated_at, gender, user_id, email, phone) FROM stdin;
1	John	Doe	\N	\N	2026-03-10 13:43:13.782597	2026-03-10 13:43:13.782597	male	\N	\N	\N
2	TestPatient	LabHistory	\N	\N	2026-03-10 13:49:30.166711	2026-03-10 13:49:30.166711	male	\N	\N	\N
3	Jane	Smith	\N	\N	2026-03-10 16:13:17.001863	2026-03-10 16:13:17.001863	female	\N	\N	\N
4	Test	Trend	\N	\N	2026-03-11 13:08:45.201159	2026-03-11 13:08:45.201159	female	\N	\N	\N
5	Alice	Anderson	1990-06-15 00:00:00	MRN-A-0001	2026-03-25 17:36:40.299376	2026-03-25 17:36:40.299376	female	1	\N	\N
6	Bob	Brown	1985-02-20 00:00:00	MRN-B-0002	2026-03-25 17:36:40.299376	2026-03-25 17:36:40.299376	male	1	\N	\N
7	Portal	Patient	\N	\N	2026-03-26 14:51:32.319979	2026-03-26 14:55:06.057	female	2	portalpatient@test.com	\N
\.


--
-- Data for Name: portal_messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.portal_messages (id, patient_id, clinician_id, sender_type, content, read_at, created_at, external_message_id) FROM stdin;
\.


--
-- Data for Name: published_protocols; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.published_protocols (id, patient_id, lab_result_id, clinician_id, supplements, clinician_notes, lab_date, published_at, dietary_guidance, first_viewed_at) FROM stdin;
\.


--
-- Data for Name: saved_interpretations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.saved_interpretations (id, patient_name, gender, lab_date, lab_values, interpretation, created_at, user_id) FROM stdin;
1	Jane Smith	female	2026-03-10 00:00:00	{"ldl": 120, "patientName": "Jane Smith"}	{"redFlags": [], "recheckWindow": "3 months", "patientSummary": "test", "interpretations": [], "aiRecommendations": "test"}	2026-03-10 16:13:16.443824	\N
2	Test Trend	female	2026-03-01 00:00:00	{"a1c": "5.5", "hdl": "55", "ldl": "120", "tsh": "2.5", "freeT4": "1.2", "vitaminD": "35", "hematocrit": "39", "hemoglobin": "13", "patientName": "Test Trend", "triglycerides": "150", "fastingGlucose": "95", "totalCholesterol": "200"}	{"redFlags": [], "supplements": [], "interpretations": []}	2026-03-11 13:08:44.72643	\N
\.


--
-- Data for Name: saved_recipes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.saved_recipes (id, patient_id, food_name, recipe_name, recipe_data, saved_at) FROM stdin;
\.


--
-- Data for Name: session; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.session (sid, sess, expire) FROM stdin;
QU4mdJPKyOLAxjIa7dES6sotiAynbq3x	{"cookie":{"originalMaxAge":604800000,"expires":"2026-04-02T14:51:26.267Z","secure":false,"httpOnly":true,"path":"/","sameSite":false},"passport":{"user":2}}	2026-04-02 14:51:47
t7Dh4HaMTmYTg_7p34M7j1FJ0ak6dK59	{"cookie":{"originalMaxAge":604800000,"expires":"2026-04-02T14:51:58.357Z","secure":false,"httpOnly":true,"path":"/","sameSite":false}}	2026-04-02 14:52:26
DLww8y-y4Q5_GmyS7LIXsiBMBqhOgpuU	{"cookie":{"originalMaxAge":604800000,"expires":"2026-04-02T14:53:27.356Z","secure":false,"httpOnly":true,"path":"/","sameSite":false},"passport":{"user":2}}	2026-04-02 14:55:07
rFpgl3MrgL0chPi5gAmWO3r7qjLkQUYm	{"cookie":{"originalMaxAge":604800000,"expires":"2026-04-02T15:59:32.670Z","secure":false,"httpOnly":true,"path":"/","sameSite":false},"passport":{"user":3}}	2026-04-02 15:59:33
xxNfhgy3CB0G9b8Po88VX-ngHtrpjYSo	{"cookie":{"originalMaxAge":604800000,"expires":"2026-04-02T16:00:20.810Z","secure":false,"httpOnly":true,"path":"/","sameSite":false},"passport":{"user":3}}	2026-04-02 16:01:02
\.


--
-- Data for Name: supplement_orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.supplement_orders (id, patient_id, clinician_id, items, subtotal, status, patient_notes, created_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, email, username, password_hash, first_name, last_name, title, npi, clinic_name, phone, address, created_at, updated_at, role, subscription_status, notes, password_reset_token, password_reset_expires, messaging_preference, messaging_phone, external_messaging_provider, external_messaging_api_key, external_messaging_channel_id, external_messaging_webhook_secret, login_attempts, locked_until) FROM stdin;
1	jane.smith@test.com	janesmith	$2b$12$DDorv8MGcvcaCvDmwt3MneJizeFHueSEQ2KO.QOn/7oSGKzbPr1qe	Jane	Smith	MD	1234567890	Optimal Health Clinic	(555) 555-0100	\N	2026-03-25 17:25:04.573848	2026-03-25 17:25:04.573848	clinician	active	\N	\N	\N	none	\N	\N	\N	\N	\N	0	\N
2	testclinician_portal@test.com	testclinician_portal	$2b$12$LNnC1QmKlJpI.SzosqmMae0V/9sFqEQSvMQNQOeQ9jZ4HYbTE6WEK	Test	Clinician	MD	1234567890	Test Portal Clinic	\N	\N	2026-03-26 14:51:19.276494	2026-03-26 14:54:33.946	clinician	active	\N	\N	\N	none	+1 (555) 123-4567	\N	\N	\N	\N	0	\N
3	teststaff_clinician_demo@example.com	teststaff_clinician_demo	$2b$12$BaKlxNnmflWXR1lEJnlroOtND.AI0lcDRwPfLKd.ruOIrNCEjhWt6	Demo	Clinician	MD	\N	Demo Clinic	\N	\N	2026-03-26 15:59:32.540982	2026-03-26 15:59:32.540982	clinician	active	\N	\N	\N	none	\N	\N	\N	\N	\N	0	\N
\.


--
-- Name: audit_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.audit_logs_id_seq', 1, false);


--
-- Name: clinician_staff_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.clinician_staff_id_seq', 1, true);


--
-- Name: lab_results_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.lab_results_id_seq', 2, true);


--
-- Name: patient_portal_accounts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.patient_portal_accounts_id_seq', 1, true);


--
-- Name: patients_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.patients_id_seq', 7, true);


--
-- Name: portal_messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.portal_messages_id_seq', 1, false);


--
-- Name: published_protocols_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.published_protocols_id_seq', 1, false);


--
-- Name: saved_interpretations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.saved_interpretations_id_seq', 2, true);


--
-- Name: saved_recipes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.saved_recipes_id_seq', 1, false);


--
-- Name: supplement_orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.supplement_orders_id_seq', 1, false);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 3, true);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: clinician_staff clinician_staff_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinician_staff
    ADD CONSTRAINT clinician_staff_email_key UNIQUE (email);


--
-- Name: clinician_staff clinician_staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinician_staff
    ADD CONSTRAINT clinician_staff_pkey PRIMARY KEY (id);


--
-- Name: lab_results lab_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_results
    ADD CONSTRAINT lab_results_pkey PRIMARY KEY (id);


--
-- Name: patient_portal_accounts patient_portal_accounts_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_portal_accounts
    ADD CONSTRAINT patient_portal_accounts_email_unique UNIQUE (email);


--
-- Name: patient_portal_accounts patient_portal_accounts_patient_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_portal_accounts
    ADD CONSTRAINT patient_portal_accounts_patient_id_unique UNIQUE (patient_id);


--
-- Name: patient_portal_accounts patient_portal_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_portal_accounts
    ADD CONSTRAINT patient_portal_accounts_pkey PRIMARY KEY (id);


--
-- Name: patients patients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_pkey PRIMARY KEY (id);


--
-- Name: portal_messages portal_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_messages
    ADD CONSTRAINT portal_messages_pkey PRIMARY KEY (id);


--
-- Name: published_protocols published_protocols_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.published_protocols
    ADD CONSTRAINT published_protocols_pkey PRIMARY KEY (id);


--
-- Name: saved_interpretations saved_interpretations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_interpretations
    ADD CONSTRAINT saved_interpretations_pkey PRIMARY KEY (id);


--
-- Name: saved_recipes saved_recipes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_recipes
    ADD CONSTRAINT saved_recipes_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: supplement_orders supplement_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplement_orders
    ADD CONSTRAINT supplement_orders_pkey PRIMARY KEY (id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_session_expire" ON public.session USING btree (expire);


--
-- Name: idx_audit_logs_clinician_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_clinician_id ON public.audit_logs USING btree (clinician_id);


--
-- Name: idx_audit_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at);


--
-- Name: idx_audit_logs_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_patient_id ON public.audit_logs USING btree (patient_id);


--
-- Name: audit_logs audit_logs_clinician_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_clinician_id_fkey FOREIGN KEY (clinician_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.clinician_staff(id) ON DELETE SET NULL;


--
-- Name: clinician_staff clinician_staff_clinician_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinician_staff
    ADD CONSTRAINT clinician_staff_clinician_id_fkey FOREIGN KEY (clinician_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: lab_results lab_results_patient_id_patients_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_results
    ADD CONSTRAINT lab_results_patient_id_patients_id_fk FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: patient_portal_accounts patient_portal_accounts_patient_id_patients_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_portal_accounts
    ADD CONSTRAINT patient_portal_accounts_patient_id_patients_id_fk FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: patients patients_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: portal_messages portal_messages_clinician_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_messages
    ADD CONSTRAINT portal_messages_clinician_id_users_id_fk FOREIGN KEY (clinician_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: portal_messages portal_messages_patient_id_patients_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_messages
    ADD CONSTRAINT portal_messages_patient_id_patients_id_fk FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: published_protocols published_protocols_clinician_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.published_protocols
    ADD CONSTRAINT published_protocols_clinician_id_users_id_fk FOREIGN KEY (clinician_id) REFERENCES public.users(id);


--
-- Name: published_protocols published_protocols_lab_result_id_lab_results_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.published_protocols
    ADD CONSTRAINT published_protocols_lab_result_id_lab_results_id_fk FOREIGN KEY (lab_result_id) REFERENCES public.lab_results(id) ON DELETE CASCADE;


--
-- Name: published_protocols published_protocols_patient_id_patients_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.published_protocols
    ADD CONSTRAINT published_protocols_patient_id_patients_id_fk FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: saved_interpretations saved_interpretations_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_interpretations
    ADD CONSTRAINT saved_interpretations_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: saved_recipes saved_recipes_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_recipes
    ADD CONSTRAINT saved_recipes_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: supplement_orders supplement_orders_clinician_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplement_orders
    ADD CONSTRAINT supplement_orders_clinician_id_fkey FOREIGN KEY (clinician_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: supplement_orders supplement_orders_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplement_orders
    ADD CONSTRAINT supplement_orders_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict XhFF8ak5X1X3Uc6VjulfY8Ta23DgVXWq5Wa8qK5lBphULHzE4IdAEo9MCdwidWd

