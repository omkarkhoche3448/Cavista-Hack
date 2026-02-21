-- =============================================================================
-- SMART EMR + AI DIAGNOSTIC ASSISTANT — POSTGRESQL PRODUCTION SCHEMA
-- Version: 1.0.0
-- Designed for: HIPAA compliance, auditability, real-time comms, HL7/FHIR export
-- =============================================================================

-- =============================================================================
-- EXTENSIONS
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- Encryption helpers
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- Fuzzy text search (ICD matching)
CREATE EXTENSION IF NOT EXISTS "btree_gist";     -- Advanced indexing
CREATE EXTENSION IF NOT EXISTS "unaccent";       -- Accent-insensitive search

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE user_role AS ENUM ('doctor', 'patient', 'admin', 'auditor');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'pending_verification');
CREATE TYPE gender_type AS ENUM ('male', 'female', 'other', 'prefer_not_to_say');

CREATE TYPE session_status AS ENUM (
    'pending',      -- created, waiting patient response
    'accepted',     -- patient accepted
    'rejected',     -- patient rejected
    'active',       -- live session in progress
    'ended',        -- doctor clicked end session
    'processing',   -- AI pipeline is running post-session
    'completed',    -- EMR approved, all tasks done
    'cancelled',    -- cancelled before start
    'expired'       -- timed out without patient response
);

CREATE TYPE ws_event_type AS ENUM (
    'SESSION_REQUESTED',
    'SESSION_ACCEPTED',
    'SESSION_REJECTED',
    'SESSION_CANCELLED',
    'SESSION_ENDED',
    'FILE_SHARED',
    'FILE_REVOKED',
    'TRANSCRIPT_CHUNK',
    'AI_INSIGHT_READY',
    'EMR_DRAFT_READY',
    'NOTIFICATION',
    'PING',
    'PONG'
);

CREATE TYPE ws_connection_status AS ENUM ('connected', 'disconnected', 'reconnecting');

CREATE TYPE document_type AS ENUM (
    'lab_report',
    'imaging',
    'prescription',
    'discharge_summary',
    'referral_letter',
    'consent_form',
    'insurance',
    'other'
);

CREATE TYPE document_status AS ENUM ('uploading', 'uploaded', 'processing', 'ready', 'failed', 'deleted');

CREATE TYPE speaker_role AS ENUM ('doctor', 'patient', 'unknown');

CREATE TYPE ai_job_status AS ENUM ('queued', 'running', 'completed', 'failed', 'retrying', 'cancelled');

CREATE TYPE ai_job_type AS ENUM (
    'pre_session_document_insight',
    'post_session_emr_generation',
    'icd_mapping',
    'treatment_suggestion',
    'patient_summary_generation'
);

CREATE TYPE emr_status AS ENUM ('draft', 'pending_approval', 'approved', 'rejected', 'archived');

CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected', 'revision_requested');

CREATE TYPE icd_version AS ENUM ('ICD-10', 'ICD-10-CM', 'ICD-11');

CREATE TYPE export_format AS ENUM ('FHIR_R4', 'HL7_V2', 'CCD', 'PDF', 'JSON', 'CSV');

CREATE TYPE export_status AS ENUM ('pending', 'processing', 'completed', 'failed');

CREATE TYPE notification_type AS ENUM (
    'session_request',
    'session_accepted',
    'session_rejected',
    'session_reminder',
    'emr_approved',
    'patient_summary_available',
    'document_shared',
    'system'
);

CREATE TYPE audit_action AS ENUM (
    'CREATE', 'READ', 'UPDATE', 'DELETE',
    'LOGIN', 'LOGOUT', 'LOGIN_FAILED',
    'EXPORT', 'SHARE', 'REVOKE',
    'APPROVE', 'REJECT',
    'SESSION_START', 'SESSION_END'
);

-- =============================================================================
-- SCHEMA NAMESPACES
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS emr;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS ai;
CREATE SCHEMA IF NOT EXISTS comms;

-- =============================================================================
-- 1. USERS
-- =============================================================================

-- public.users extends auth.users (managed by Supabase).
-- id is the same UUID issued by Supabase; no password/MFA/session columns here.
CREATE TABLE public.users (
    id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email               VARCHAR(255) NOT NULL UNIQUE,           -- denormalized from auth.users for fast JOINs
    role                user_role NOT NULL,
    status              user_status NOT NULL DEFAULT 'pending_verification',
    first_name          VARCHAR(100) NOT NULL,
    last_name           VARCHAR(100) NOT NULL,
    phone               VARCHAR(30),
    date_of_birth       DATE,
    gender              gender_type,
    profile_picture_url TEXT,
    timezone            VARCHAR(60) DEFAULT 'UTC',
    locale              VARCHAR(10) DEFAULT 'en-US',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,                            -- soft delete
    created_by          UUID REFERENCES public.users(id),
    modified_by         UUID REFERENCES public.users(id)
);

CREATE INDEX idx_users_email        ON public.users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_role         ON public.users(role)  WHERE deleted_at IS NULL;
CREATE INDEX idx_users_status       ON public.users(status);

-- =============================================================================
-- 2. DOCTOR PROFILES
-- =============================================================================

CREATE TABLE public.doctor_profiles (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
    license_number      VARCHAR(100) NOT NULL UNIQUE,
    npi_number          VARCHAR(20),                            -- National Provider Identifier
    specialty           VARCHAR(150),
    sub_specialty        VARCHAR(150),
    hospital_affiliation VARCHAR(200),
    department          VARCHAR(150),
    years_of_experience  SMALLINT,
    bio                 TEXT,
    is_available        BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_doctor_profiles_user_id ON public.doctor_profiles(user_id);
CREATE INDEX idx_doctor_profiles_specialty ON public.doctor_profiles(specialty);

-- =============================================================================
-- 3. PATIENT PROFILES
-- =============================================================================

CREATE TABLE public.patient_profiles (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
    mrn                     VARCHAR(50) UNIQUE,                 -- Medical Record Number
    blood_type              VARCHAR(5),
    height_cm               NUMERIC(5,1),
    weight_kg               NUMERIC(5,1),
    emergency_contact_name  VARCHAR(200),
    emergency_contact_phone VARCHAR(30),
    emergency_contact_relation VARCHAR(50),
    insurance_provider      VARCHAR(200),
    insurance_policy_number VARCHAR(100),
    consent_research        BOOLEAN DEFAULT FALSE,
    consent_data_sharing    BOOLEAN DEFAULT FALSE,
    consent_signed_at       TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ
);

CREATE INDEX idx_patient_profiles_user_id ON public.patient_profiles(user_id);
CREATE INDEX idx_patient_profiles_mrn     ON public.patient_profiles(mrn);

-- =============================================================================
-- 4. AUTO-CREATE PROFILE ON SUPABASE SIGNUP
-- Supabase calls this trigger after inserting into auth.users.
-- The app must pass role, first_name, last_name in the signup metadata:
--   supabase.auth.signUp({ email, password, options: { data: { role, first_name, last_name } } })
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO public.users (id, email, role, first_name, last_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'patient'),
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'last_name',  '')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- NOTE: refresh tokens, MFA, login attempts, and email verification
--       are fully managed by Supabase Auth — no tables needed here.

-- =============================================================================
-- 5. SESSIONS
-- =============================================================================

CREATE TABLE public.sessions (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doctor_id               UUID NOT NULL REFERENCES public.users(id),
    patient_id              UUID NOT NULL REFERENCES public.users(id),
    status                  session_status NOT NULL DEFAULT 'pending',
    title                   VARCHAR(300),
    chief_complaint         TEXT,                               -- can be prefilled
    scheduled_at            TIMESTAMPTZ,
    started_at              TIMESTAMPTZ,
    ended_at                TIMESTAMPTZ,
    duration_seconds        INTEGER,                            -- computed on end
    rejection_reason        TEXT,
    cancellation_reason     TEXT,
    request_expires_at      TIMESTAMPTZ,                        -- patient must respond by
    is_emergency            BOOLEAN NOT NULL DEFAULT FALSE,
    session_notes           TEXT,                               -- doctor private notes
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID REFERENCES public.users(id),
    modified_by             UUID REFERENCES public.users(id),
    CONSTRAINT chk_session_doctor_patient CHECK (doctor_id <> patient_id)
);

CREATE INDEX idx_sessions_doctor_id  ON public.sessions(doctor_id)  WHERE deleted_at IS NULL;
CREATE INDEX idx_sessions_patient_id ON public.sessions(patient_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_sessions_status     ON public.sessions(status);
CREATE INDEX idx_sessions_created_at ON public.sessions(created_at DESC);

-- =============================================================================
-- 6. SESSION STATE HISTORY (full audit trail of status transitions)
-- =============================================================================

CREATE TABLE public.session_state_history (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    from_status     session_status,
    to_status       session_status NOT NULL,
    changed_by      UUID REFERENCES public.users(id),
    reason          TEXT,
    metadata        JSONB,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_session_state_history_session_id ON public.session_state_history(session_id);
CREATE INDEX idx_session_state_history_changed_at  ON public.session_state_history(changed_at DESC);

-- =============================================================================
-- 7. WEBSOCKET CONNECTIONS
-- =============================================================================

CREATE TABLE comms.ws_connections (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    session_id      UUID REFERENCES public.sessions(id),
    connection_id   TEXT NOT NULL,                              -- server-assigned socket ID
    server_node     VARCHAR(100),                               -- which pod/node owns this conn
    status          ws_connection_status NOT NULL DEFAULT 'connected',
    connected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    disconnected_at TIMESTAMPTZ,
    last_ping_at    TIMESTAMPTZ,
    user_agent      TEXT,
    ip_address      INET,
    metadata        JSONB
);

CREATE INDEX idx_ws_connections_user_id      ON comms.ws_connections(user_id);
CREATE INDEX idx_ws_connections_session_id   ON comms.ws_connections(session_id);
CREATE INDEX idx_ws_connections_connection_id ON comms.ws_connections(connection_id);
CREATE INDEX idx_ws_connections_status       ON comms.ws_connections(status);

-- =============================================================================
-- 8. WEBSOCKET EVENTS LOG
-- =============================================================================

CREATE TABLE comms.ws_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID REFERENCES public.sessions(id),
    sender_id       UUID REFERENCES public.users(id),
    connection_id   TEXT,
    event_type      ws_event_type NOT NULL,
    payload         JSONB NOT NULL DEFAULT '{}',
    delivered       BOOLEAN NOT NULL DEFAULT FALSE,
    delivered_at    TIMESTAMPTZ,
    error           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ws_events_session_id  ON comms.ws_events(session_id);
CREATE INDEX idx_ws_events_event_type  ON comms.ws_events(event_type);
CREATE INDEX idx_ws_events_created_at  ON comms.ws_events(created_at DESC);

-- =============================================================================
-- 9. MEDICAL DOCUMENTS
-- =============================================================================

CREATE TABLE public.medical_documents (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id          UUID NOT NULL REFERENCES public.users(id),
    uploaded_by         UUID NOT NULL REFERENCES public.users(id),
    document_type       document_type NOT NULL,
    status              document_status NOT NULL DEFAULT 'uploading',
    title               VARCHAR(300) NOT NULL,
    description         TEXT,
    file_name           VARCHAR(500) NOT NULL,
    file_mime_type      VARCHAR(100) NOT NULL,
    file_size_bytes     BIGINT,
    storage_bucket      VARCHAR(200),                           -- S3/GCS bucket
    storage_key         TEXT NOT NULL,                          -- encrypted path
    storage_url         TEXT,                                   -- pre-signed URL (not stored permanently)
    checksum_sha256     CHAR(64),                               -- integrity verification
    is_encrypted        BOOLEAN NOT NULL DEFAULT TRUE,
    encryption_key_id   VARCHAR(200),                           -- KMS key reference
    document_date       DATE,                                   -- date on the document itself
    is_sensitive        BOOLEAN NOT NULL DEFAULT FALSE,
    tags                TEXT[],
    ocr_extracted_text  TEXT,                                   -- for searchability
    version             INTEGER NOT NULL DEFAULT 1,
    parent_document_id  UUID REFERENCES public.medical_documents(id), -- for versioning
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID REFERENCES public.users(id),
    modified_by         UUID REFERENCES public.users(id)
);

CREATE INDEX idx_medical_docs_patient_id    ON public.medical_documents(patient_id)  WHERE deleted_at IS NULL;
CREATE INDEX idx_medical_docs_uploaded_by   ON public.medical_documents(uploaded_by) WHERE deleted_at IS NULL;
CREATE INDEX idx_medical_docs_type          ON public.medical_documents(document_type);
CREATE INDEX idx_medical_docs_status        ON public.medical_documents(status);
CREATE INDEX idx_medical_docs_tags          ON public.medical_documents USING GIN(tags);
CREATE INDEX idx_medical_docs_ocr_text      ON public.medical_documents USING GIN(to_tsvector('english', COALESCE(ocr_extracted_text, '')));

-- =============================================================================
-- 10. SESSION DOCUMENT SHARES (patient selects docs to share per session)
-- =============================================================================

CREATE TABLE public.session_document_shares (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    document_id     UUID NOT NULL REFERENCES public.medical_documents(id),
    shared_by       UUID NOT NULL REFERENCES public.users(id),   -- should be patient
    revoked_at      TIMESTAMPTZ,
    revoked_by      UUID REFERENCES public.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, document_id)
);

CREATE INDEX idx_session_doc_shares_session_id  ON public.session_document_shares(session_id);
CREATE INDEX idx_session_doc_shares_document_id ON public.session_document_shares(document_id);

-- =============================================================================
-- 11. TRANSCRIPT CHUNKS (real-time streaming ingestion)
-- =============================================================================

CREATE TABLE public.transcript_chunks (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    chunk_index         INTEGER NOT NULL,                       -- ordering within session
    speaker_role        speaker_role NOT NULL DEFAULT 'unknown',
    speaker_user_id     UUID REFERENCES public.users(id),       -- resolved speaker
    raw_text            TEXT NOT NULL,
    normalized_text     TEXT,                                   -- post-processed clean text
    start_time_ms       BIGINT NOT NULL,                        -- ms from session start
    end_time_ms         BIGINT NOT NULL,
    duration_ms         INTEGER GENERATED ALWAYS AS (CAST(end_time_ms - start_time_ms AS INTEGER)) STORED,
    confidence_score    NUMERIC(5,4) CHECK (confidence_score BETWEEN 0 AND 1),
    language_code       VARCHAR(10) DEFAULT 'en-US',
    asr_model           VARCHAR(100),                           -- e.g. 'google-medical-asr-v2'
    asr_model_version   VARCHAR(50),
    is_final            BOOLEAN NOT NULL DEFAULT FALSE,         -- streaming: interim vs final
    metadata            JSONB,                                  -- word-level timestamps, alternatives
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, chunk_index)
);

CREATE INDEX idx_transcript_chunks_session_id   ON public.transcript_chunks(session_id);
CREATE INDEX idx_transcript_chunks_speaker      ON public.transcript_chunks(session_id, speaker_role);
CREATE INDEX idx_transcript_chunks_start_time   ON public.transcript_chunks(session_id, start_time_ms);
CREATE INDEX idx_transcript_chunks_text_search  ON public.transcript_chunks USING GIN(to_tsvector('english', raw_text));

-- =============================================================================
-- 12. FINAL TRANSCRIPTS (compiled full transcript after session ends)
-- =============================================================================

CREATE TABLE public.final_transcripts (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          UUID NOT NULL UNIQUE REFERENCES public.sessions(id) ON DELETE CASCADE,
    full_text           TEXT NOT NULL,                          -- concatenated all chunks
    total_chunks        INTEGER NOT NULL DEFAULT 0,
    total_duration_ms   BIGINT,
    doctor_word_count   INTEGER,
    patient_word_count  INTEGER,
    avg_confidence      NUMERIC(5,4),
    language_code       VARCHAR(10) DEFAULT 'en-US',
    compiled_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    compiled_by         VARCHAR(100),                           -- 'system' or user id
    checksum_sha256     CHAR(64),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_final_transcripts_session_id ON public.final_transcripts(session_id);

-- =============================================================================
-- 13. AI JOBS (async job queue tracking)
-- =============================================================================

CREATE TABLE ai.jobs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          UUID REFERENCES public.sessions(id),
    document_id         UUID REFERENCES public.medical_documents(id),
    job_type            ai_job_type NOT NULL,
    status              ai_job_status NOT NULL DEFAULT 'queued',
    priority            SMALLINT NOT NULL DEFAULT 5,            -- 1=highest, 10=lowest
    queue_name          VARCHAR(100) DEFAULT 'default',
    worker_id           VARCHAR(200),                           -- which worker took it
    attempt_count       SMALLINT NOT NULL DEFAULT 0,
    max_attempts        SMALLINT NOT NULL DEFAULT 3,
    input_payload       JSONB NOT NULL DEFAULT '{}',
    output_payload      JSONB,
    error_message       TEXT,
    error_trace         TEXT,
    model_name          VARCHAR(150),                           -- e.g. 'gpt-4o', 'claude-3-opus'
    model_version       VARCHAR(50),
    prompt_template_id  UUID,                                   -- FK to prompt_templates
    tokens_used         INTEGER,
    cost_usd            NUMERIC(10,6),
    queued_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    next_retry_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_jobs_session_id    ON ai.jobs(session_id);
CREATE INDEX idx_ai_jobs_job_type      ON ai.jobs(job_type);
CREATE INDEX idx_ai_jobs_status        ON ai.jobs(status);
CREATE INDEX idx_ai_jobs_queued_at     ON ai.jobs(queued_at) WHERE status = 'queued';
CREATE INDEX idx_ai_jobs_next_retry    ON ai.jobs(next_retry_at) WHERE status = 'retrying';

-- =============================================================================
-- 14. PROMPT TEMPLATES (versioned prompts for LLM calls)
-- =============================================================================

CREATE TABLE ai.prompt_templates (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(200) NOT NULL,
    job_type        ai_job_type NOT NULL,
    version         VARCHAR(20) NOT NULL,
    content         TEXT NOT NULL,
    system_prompt   TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    model_target    VARCHAR(150),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      UUID REFERENCES public.users(id),
    UNIQUE (name, version)
);

CREATE INDEX idx_prompt_templates_job_type ON ai.prompt_templates(job_type);
CREATE INDEX idx_prompt_templates_active   ON ai.prompt_templates(is_active);

-- =============================================================================
-- 15. PRE-SESSION DOCUMENT INSIGHTS
-- =============================================================================

CREATE TABLE ai.pre_session_insights (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    document_id         UUID NOT NULL REFERENCES public.medical_documents(id),
    ai_job_id           UUID REFERENCES ai.jobs(id),
    insight_type        VARCHAR(100),                           -- 'risk_factors', 'history_summary', etc.
    summary             TEXT,
    risk_flags          JSONB,                                  -- [{flag, severity, source}]
    key_findings        JSONB,                                  -- [{finding, value, normal_range}]
    medications_found   JSONB,
    allergies_found     JSONB,
    raw_llm_output      TEXT,
    model_used          VARCHAR(150),
    model_version       VARCHAR(50),
    prompt_version      VARCHAR(20),
    confidence_score    NUMERIC(5,4),
    reviewed_by         UUID REFERENCES public.users(id),
    reviewed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pre_session_insights_session_id  ON ai.pre_session_insights(session_id);
CREATE INDEX idx_pre_session_insights_document_id ON ai.pre_session_insights(document_id);

-- =============================================================================
-- 16. ICD-10 REFERENCE TABLE
-- =============================================================================

CREATE TABLE emr.icd_codes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code            VARCHAR(20) NOT NULL,
    version         icd_version NOT NULL DEFAULT 'ICD-10-CM',
    short_desc      VARCHAR(300) NOT NULL,
    long_desc       TEXT,
    category        VARCHAR(10),                                -- e.g. 'A00-B99'
    block           VARCHAR(10),
    billable        BOOLEAN NOT NULL DEFAULT TRUE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    effective_date  DATE,
    revision        VARCHAR(10),
    search_vector   tsvector GENERATED ALWAYS AS (
                        to_tsvector('english', short_desc || ' ' || COALESCE(long_desc, ''))
                    ) STORED,
    UNIQUE (code, version)
);

CREATE INDEX idx_icd_codes_code           ON emr.icd_codes(code);
CREATE INDEX idx_icd_codes_search_vector  ON emr.icd_codes USING GIN(search_vector);
CREATE INDEX idx_icd_codes_short_desc_trgm ON emr.icd_codes USING GIN(short_desc gin_trgm_ops);

-- =============================================================================
-- 17. EMR DRAFTS
-- =============================================================================

CREATE TABLE emr.emr_drafts (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id              UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    ai_job_id               UUID REFERENCES ai.jobs(id),
    version                 INTEGER NOT NULL DEFAULT 1,
    status                  emr_status NOT NULL DEFAULT 'draft',

    -- Clinical Content
    chief_complaint         TEXT,
    history_present_illness TEXT,
    past_medical_history    JSONB,   -- [{condition, onset, status}]
    past_surgical_history   JSONB,   -- [{procedure, date, notes}]
    family_history          JSONB,   -- [{relation, condition}]
    social_history          JSONB,   -- {smoking, alcohol, occupation, ...}
    review_of_systems       JSONB,   -- {cardiovascular: '...', respiratory: '...', ...}
    medications             JSONB,   -- [{name, dose, frequency, route, start_date}]
    allergies               JSONB,   -- [{allergen, reaction, severity}]
    vital_signs             JSONB,   -- {bp, hr, rr, temp, spo2, weight, height}
    physical_examination    JSONB,   -- {general, heent, cardio, resp, ...}
    investigations_ordered  JSONB,   -- [{type, rationale}]
    investigations_results  JSONB,   -- [{name, value, unit, normal_range, flag}]
    assessment              TEXT,
    diagnoses               JSONB,   -- [{description, icd_code, type: primary|secondary}]
    treatment_plan          JSONB,   -- [{action, rationale, priority}]
    medications_prescribed  JSONB,   -- [{drug, dose, route, frequency, duration}]
    follow_up_plan          TEXT,
    referrals               JSONB,   -- [{specialty, reason, urgency}]
    patient_instructions    TEXT,
    prognosis               TEXT,
    attachments             JSONB,   -- [{document_id, role}]
    transcript_reference_id UUID REFERENCES public.final_transcripts(id),

    -- AI Metadata
    model_used              VARCHAR(150),
    model_version           VARCHAR(50),
    prompt_version          VARCHAR(20),
    generation_confidence   NUMERIC(5,4),
    raw_llm_output          TEXT,

    -- Approval workflow
    submitted_for_review_at TIMESTAMPTZ,
    reviewed_by             UUID REFERENCES public.users(id),
    reviewed_at             TIMESTAMPTZ,
    review_notes            TEXT,
    approved_at             TIMESTAMPTZ,
    approved_by             UUID REFERENCES public.users(id),

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by              UUID REFERENCES public.users(id),
    modified_by             UUID REFERENCES public.users(id),

    UNIQUE (session_id, version)
);

CREATE INDEX idx_emr_drafts_session_id ON emr.emr_drafts(session_id);
CREATE INDEX idx_emr_drafts_status     ON emr.emr_drafts(status);
CREATE INDEX idx_emr_drafts_version    ON emr.emr_drafts(session_id, version DESC);

-- =============================================================================
-- 18. FINAL EMRS (doctor-approved, immutable record)
-- =============================================================================

CREATE TABLE emr.final_emrs (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id              UUID NOT NULL UNIQUE REFERENCES public.sessions(id),
    draft_id                UUID NOT NULL REFERENCES emr.emr_drafts(id),
    doctor_id               UUID NOT NULL REFERENCES public.users(id),
    patient_id              UUID NOT NULL REFERENCES public.users(id),
    version                 INTEGER NOT NULL DEFAULT 1,

    -- Snapshot of approved EMR content (immutable after approval)
    emr_content             JSONB NOT NULL,                    -- full snapshot
    emr_checksum            CHAR(64),                          -- SHA-256 of content

    approved_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_by             UUID NOT NULL REFERENCES public.users(id),
    is_amended              BOOLEAN NOT NULL DEFAULT FALSE,
    amendment_reason        TEXT,
    parent_emr_id           UUID REFERENCES emr.final_emrs(id), -- for amendments

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_final_emrs_session_id  ON emr.final_emrs(session_id);
CREATE INDEX idx_final_emrs_patient_id  ON emr.final_emrs(patient_id);
CREATE INDEX idx_final_emrs_doctor_id   ON emr.final_emrs(doctor_id);
CREATE INDEX idx_final_emrs_approved_at ON emr.final_emrs(approved_at DESC);

-- =============================================================================
-- 19. ICD CODE MAPPINGS (session-level diagnosis-to-ICD mapping)
-- =============================================================================

CREATE TABLE emr.icd_mappings (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    emr_draft_id        UUID REFERENCES emr.emr_drafts(id),
    final_emr_id        UUID REFERENCES emr.final_emrs(id),
    ai_job_id           UUID REFERENCES ai.jobs(id),
    diagnosis_text      TEXT NOT NULL,                          -- free-text from LLM
    icd_code_id         UUID REFERENCES emr.icd_codes(id),
    icd_code            VARCHAR(20),
    icd_description     VARCHAR(300),
    icd_version         icd_version DEFAULT 'ICD-10-CM',
    match_method        VARCHAR(50),                            -- 'llm', 'fuzzy', 'exact', 'manual'
    confidence_score    NUMERIC(5,4),
    is_primary          BOOLEAN NOT NULL DEFAULT FALSE,
    doctor_override     BOOLEAN NOT NULL DEFAULT FALSE,
    original_ai_code    VARCHAR(20),                            -- before doctor override
    approval_status     approval_status NOT NULL DEFAULT 'pending',
    approved_by         UUID REFERENCES public.users(id),
    approved_at         TIMESTAMPTZ,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_icd_mappings_session_id   ON emr.icd_mappings(session_id);
CREATE INDEX idx_icd_mappings_icd_code     ON emr.icd_mappings(icd_code);
CREATE INDEX idx_icd_mappings_approval     ON emr.icd_mappings(approval_status);

-- =============================================================================
-- 20. TREATMENT SUGGESTIONS
-- =============================================================================

CREATE TABLE emr.treatment_suggestions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    emr_draft_id        UUID REFERENCES emr.emr_drafts(id),
    ai_job_id           UUID REFERENCES ai.jobs(id),
    suggestion_type     VARCHAR(100),                           -- 'medication', 'procedure', 'lifestyle', 'referral'
    title               VARCHAR(300) NOT NULL,
    description         TEXT,
    rationale           TEXT,
    evidence_basis      TEXT,                                   -- guideline reference
    priority            VARCHAR(20),                            -- 'urgent', 'recommended', 'optional'
    contraindications   TEXT,
    alternatives        JSONB,
    model_used          VARCHAR(150),
    confidence_score    NUMERIC(5,4),
    approval_status     approval_status NOT NULL DEFAULT 'pending',
    approved_by         UUID REFERENCES public.users(id),
    approved_at         TIMESTAMPTZ,
    doctor_notes        TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_treatment_suggestions_session_id ON emr.treatment_suggestions(session_id);
CREATE INDEX idx_treatment_suggestions_approval   ON emr.treatment_suggestions(approval_status);

-- =============================================================================
-- 21. PATIENT SUMMARIES (AI-generated, doctor-approved, sent to patient)
-- =============================================================================

CREATE TABLE emr.patient_summaries (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          UUID NOT NULL UNIQUE REFERENCES public.sessions(id),
    final_emr_id        UUID REFERENCES emr.final_emrs(id),
    ai_job_id           UUID REFERENCES ai.jobs(id),
    summary_text        TEXT NOT NULL,                          -- patient-friendly
    language_code       VARCHAR(10) DEFAULT 'en-US',
    reading_level       VARCHAR(50),                            -- e.g. '6th grade'
    key_takeaways       JSONB,                                  -- [{point}]
    medications_list    JSONB,
    follow_up_date      DATE,
    follow_up_notes     TEXT,
    warnings            JSONB,                                  -- critical alerts
    model_used          VARCHAR(150),
    approval_status     approval_status NOT NULL DEFAULT 'pending',
    approved_by         UUID REFERENCES public.users(id),
    approved_at         TIMESTAMPTZ,
    sent_to_patient_at  TIMESTAMPTZ,
    patient_read_at     TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_patient_summaries_session_id ON emr.patient_summaries(session_id);
CREATE INDEX idx_patient_summaries_approval   ON emr.patient_summaries(approval_status);

-- =============================================================================
-- 22. NOTIFICATIONS
-- =============================================================================

CREATE TABLE comms.notifications (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    sender_id           UUID REFERENCES public.users(id),
    session_id          UUID REFERENCES public.sessions(id),
    notification_type   notification_type NOT NULL,
    title               VARCHAR(300) NOT NULL,
    body                TEXT,
    payload             JSONB,
    is_read             BOOLEAN NOT NULL DEFAULT FALSE,
    read_at             TIMESTAMPTZ,
    is_actioned         BOOLEAN NOT NULL DEFAULT FALSE,
    actioned_at         TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    priority            VARCHAR(20) DEFAULT 'normal',
    channel             VARCHAR(50) DEFAULT 'in_app',           -- 'in_app', 'push', 'email', 'sms'
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_recipient_id ON comms.notifications(recipient_id, is_read);
CREATE INDEX idx_notifications_session_id   ON comms.notifications(session_id);
CREATE INDEX idx_notifications_type         ON comms.notifications(notification_type);
CREATE INDEX idx_notifications_created_at   ON comms.notifications(created_at DESC);

-- =============================================================================
-- 23. EMR EXPORT LOGS
-- =============================================================================

CREATE TABLE emr.export_logs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    final_emr_id        UUID NOT NULL REFERENCES emr.final_emrs(id),
    session_id          UUID NOT NULL REFERENCES public.sessions(id),
    requested_by        UUID NOT NULL REFERENCES public.users(id),
    export_format       export_format NOT NULL,
    status              export_status NOT NULL DEFAULT 'pending',
    destination         VARCHAR(500),                           -- endpoint URL / S3 key
    recipient_system    VARCHAR(200),                           -- 'epic', 'cerner', etc.
    file_size_bytes     BIGINT,
    checksum_sha256     CHAR(64),
    error_message       TEXT,
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    download_url        TEXT,                                   -- pre-signed, short-lived
    download_url_exp_at TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_export_logs_final_emr_id ON emr.export_logs(final_emr_id);
CREATE INDEX idx_export_logs_session_id   ON emr.export_logs(session_id);
CREATE INDEX idx_export_logs_status       ON emr.export_logs(status);

-- =============================================================================
-- 24. INTEGRATION LOGS (HL7/FHIR outbound webhook events)
-- =============================================================================

CREATE TABLE public.integration_logs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          UUID REFERENCES public.sessions(id),
    final_emr_id        UUID REFERENCES emr.final_emrs(id),
    integration_type    VARCHAR(100) NOT NULL,                  -- 'FHIR_R4', 'HL7_V2', 'WEBHOOK'
    target_system       VARCHAR(200),
    target_url          TEXT,
    http_method         VARCHAR(10),
    request_headers     JSONB,
    request_body        TEXT,                                   -- may be large HL7/FHIR doc
    response_status     INTEGER,
    response_body       TEXT,
    response_time_ms    INTEGER,
    success             BOOLEAN,
    error_message       TEXT,
    retry_count         SMALLINT DEFAULT 0,
    triggered_by        UUID REFERENCES public.users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_integration_logs_session_id  ON public.integration_logs(session_id);
CREATE INDEX idx_integration_logs_emr_id      ON public.integration_logs(final_emr_id);
CREATE INDEX idx_integration_logs_type        ON public.integration_logs(integration_type);
CREATE INDEX idx_integration_logs_created_at  ON public.integration_logs(created_at DESC);

-- =============================================================================
-- 25. AUDIT LOGS (comprehensive HIPAA auditability)
-- =============================================================================

CREATE TABLE audit.audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    event_id        UUID NOT NULL DEFAULT uuid_generate_v4(),
    actor_id        UUID REFERENCES public.users(id),           -- who did it
    actor_role      user_role,
    actor_ip        INET,
    actor_user_agent TEXT,
    action          audit_action NOT NULL,
    resource_type   VARCHAR(100) NOT NULL,                      -- 'session', 'emr', 'document', ...
    resource_id     TEXT,                                       -- UUID as text
    resource_schema VARCHAR(50),
    resource_table  VARCHAR(100),
    old_values      JSONB,                                      -- before state
    new_values      JSONB,                                      -- after state
    diff            JSONB,                                      -- computed diff
    session_id      UUID,                                       -- clinical session context
    request_id      TEXT,                                       -- HTTP request trace ID
    success         BOOLEAN NOT NULL DEFAULT TRUE,
    failure_reason  TEXT,
    phi_accessed    BOOLEAN NOT NULL DEFAULT FALSE,             -- HIPAA: was PHI touched
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit logs are append-only — no UPDATE or DELETE allowed
-- Enforced via RLS policy (see below)
CREATE INDEX idx_audit_logs_actor_id      ON audit.audit_logs(actor_id);
CREATE INDEX idx_audit_logs_resource      ON audit.audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_action        ON audit.audit_logs(action);
CREATE INDEX idx_audit_logs_created_at    ON audit.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_phi_accessed  ON audit.audit_logs(phi_accessed) WHERE phi_accessed = TRUE;
CREATE INDEX idx_audit_logs_session_id    ON audit.audit_logs(session_id);

-- =============================================================================
-- 26. ROW-LEVEL SECURITY (RLS) — PHI Isolation
-- =============================================================================

ALTER TABLE public.medical_documents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcript_chunks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.final_transcripts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE emr.emr_drafts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE emr.final_emrs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE emr.patient_summaries          ENABLE ROW LEVEL SECURITY;
ALTER TABLE emr.icd_mappings               ENABLE ROW LEVEL SECURITY;
ALTER TABLE emr.treatment_suggestions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.audit_logs               ENABLE ROW LEVEL SECURITY;

-- Doctors can only see documents shared in their sessions
CREATE POLICY doctor_sees_shared_docs ON public.medical_documents
    FOR SELECT USING (
        patient_id = current_setting('app.current_user_id', TRUE)::UUID
        OR
        id IN (
            SELECT document_id FROM public.session_document_shares sds
            JOIN public.sessions s ON s.id = sds.session_id
            WHERE s.doctor_id = current_setting('app.current_user_id', TRUE)::UUID
              AND sds.revoked_at IS NULL
        )
        OR
        uploaded_by = current_setting('app.current_user_id', TRUE)::UUID
    );

-- Patients only see their own documents
CREATE POLICY patient_owns_docs ON public.medical_documents
    FOR ALL USING (
        patient_id = current_setting('app.current_user_id', TRUE)::UUID
    );

-- Audit logs are append-only: no delete, no update
CREATE POLICY audit_append_only_no_delete ON audit.audit_logs
    FOR DELETE USING (FALSE);

CREATE POLICY audit_append_only_no_update ON audit.audit_logs
    FOR UPDATE USING (FALSE);

-- =============================================================================
-- 27. UPDATED_AT AUTO-UPDATE TRIGGER
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Apply to all tables with updated_at
DO $$
DECLARE
    tbl RECORD;
BEGIN
    FOR tbl IN
        SELECT table_schema, table_name
        FROM information_schema.columns
        WHERE column_name = 'updated_at'
          AND table_schema IN ('public', 'emr', 'ai', 'comms')
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON %I.%I
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
            tbl.table_schema, tbl.table_name
        );
    END LOOP;
END;
$$;

-- =============================================================================
-- 28. SESSION DURATION AUTO-COMPUTE TRIGGER
-- =============================================================================

CREATE OR REPLACE FUNCTION public.compute_session_duration()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.ended_at IS NOT NULL AND NEW.started_at IS NOT NULL THEN
        NEW.duration_seconds = EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))::INTEGER;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_session_duration
    BEFORE UPDATE ON public.sessions
    FOR EACH ROW
    WHEN (NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL)
    EXECUTE FUNCTION public.compute_session_duration();

-- =============================================================================
-- 29. AUDIT TRIGGER (auto-log all PHI table mutations)
-- =============================================================================

CREATE OR REPLACE FUNCTION audit.log_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    old_row JSONB := NULL;
    new_row JSONB := NULL;
BEGIN
    IF TG_OP = 'DELETE' THEN
        old_row := to_jsonb(OLD);
    ELSIF TG_OP = 'INSERT' THEN
        new_row := to_jsonb(NEW);
    ELSE
        old_row := to_jsonb(OLD);
        new_row := to_jsonb(NEW);
    END IF;

    INSERT INTO audit.audit_logs (
        actor_id, action, resource_type, resource_table,
        resource_id, old_values, new_values, phi_accessed, created_at
    ) VALUES (
        NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID,
        TG_OP::audit_action,
        TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
        TG_TABLE_NAME,
        COALESCE((new_row->>'id'), (old_row->>'id')),
        old_row,
        new_row,
        TRUE,
        NOW()
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach audit trigger to PHI tables
CREATE TRIGGER audit_medical_documents
    AFTER INSERT OR UPDATE OR DELETE ON public.medical_documents
    FOR EACH ROW EXECUTE FUNCTION audit.log_change();

CREATE TRIGGER audit_emr_drafts
    AFTER INSERT OR UPDATE OR DELETE ON emr.emr_drafts
    FOR EACH ROW EXECUTE FUNCTION audit.log_change();

CREATE TRIGGER audit_final_emrs
    AFTER INSERT OR UPDATE OR DELETE ON emr.final_emrs
    FOR EACH ROW EXECUTE FUNCTION audit.log_change();

CREATE TRIGGER audit_icd_mappings
    AFTER INSERT OR UPDATE OR DELETE ON emr.icd_mappings
    FOR EACH ROW EXECUTE FUNCTION audit.log_change();

-- =============================================================================
-- 30. VIEWS
-- =============================================================================

-- Active sessions with participant info
CREATE OR REPLACE VIEW public.v_active_sessions AS
SELECT
    s.id,
    s.status,
    s.started_at,
    s.chief_complaint,
    s.is_emergency,
    d.id   AS doctor_user_id,
    d.first_name || ' ' || d.last_name AS doctor_name,
    d.email AS doctor_email,
    dp.specialty AS doctor_specialty,
    p.id   AS patient_user_id,
    p.first_name || ' ' || p.last_name AS patient_name,
    p.email AS patient_email,
    pp.mrn AS patient_mrn
FROM public.sessions s
JOIN public.users d  ON d.id = s.doctor_id
JOIN public.users p  ON p.id = s.patient_id
LEFT JOIN public.doctor_profiles dp ON dp.user_id = d.id
LEFT JOIN public.patient_profiles pp ON pp.user_id = p.id
WHERE s.status IN ('active', 'pending', 'accepted')
  AND s.deleted_at IS NULL;

-- Doctor approval dashboard
CREATE OR REPLACE VIEW emr.v_pending_approvals AS
SELECT
    ed.id AS draft_id,
    s.id AS session_id,
    s.doctor_id,
    s.patient_id,
    ed.status,
    ed.version,
    ed.submitted_for_review_at,
    p.first_name || ' ' || p.last_name AS patient_name,
    (SELECT COUNT(*) FROM emr.icd_mappings im WHERE im.emr_draft_id = ed.id AND im.approval_status = 'pending') AS pending_icd_count,
    (SELECT COUNT(*) FROM emr.treatment_suggestions ts WHERE ts.emr_draft_id = ed.id AND ts.approval_status = 'pending') AS pending_treatment_count
FROM emr.emr_drafts ed
JOIN public.sessions s ON s.id = ed.session_id
JOIN public.users p ON p.id = s.patient_id
WHERE ed.status = 'pending_approval';

-- =============================================================================
-- 31. PARTITIONING — transcript_chunks by session created_at (high volume)
-- =============================================================================
-- For 10k concurrent sessions, consider partitioning transcript_chunks by month:
-- ALTER TABLE public.transcript_chunks PARTITION BY RANGE (created_at);
-- (Requires converting to partitioned table in production migration)

-- =============================================================================
-- 32. SEED: ICD-10 version metadata
-- =============================================================================

INSERT INTO emr.icd_codes (code, version, short_desc, long_desc, billable)
VALUES
    ('J06.9',  'ICD-10-CM', 'Acute upper respiratory infection, unspecified',   'Acute URI NOS', TRUE),
    ('I10',    'ICD-10-CM', 'Essential (primary) hypertension',                 'HTN NOS', TRUE),
    ('E11.9',  'ICD-10-CM', 'Type 2 diabetes mellitus without complications',   'T2DM NOS', TRUE),
    ('J18.9',  'ICD-10-CM', 'Pneumonia, unspecified organism',                  'Pneumonia NOS', TRUE),
    ('K21.0',  'ICD-10-CM', 'Gastro-esophageal reflux disease with esophagitis','GERD with esophagitis', TRUE),
    ('M54.5',  'ICD-10-CM', 'Low back pain',                                    'LBP NOS', TRUE),
    ('F32.9',  'ICD-10-CM', 'Major depressive disorder, single episode, unspecified', 'MDD NOS', TRUE),
    ('J45.909','ICD-10-CM', 'Unspecified asthma, uncomplicated',                'Asthma NOS', TRUE),
    ('N39.0',  'ICD-10-CM', 'Urinary tract infection, site not specified',      'UTI NOS', TRUE),
    ('Z00.00', 'ICD-10-CM', 'Encounter for general adult medical examination without abnormal findings', 'Annual exam', TRUE)
ON CONFLICT (code, version) DO NOTHING;

-- =============================================================================
-- SCHEMA COMPLETE
-- =============================================================================
