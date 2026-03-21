-- =============================================================================
-- MIGRATION: Create missing tables in public schema
-- Run this in the Supabase SQL Editor.
-- These tables were in emr/comms/ai schemas which are NOT exposed by Supabase REST API.
-- =============================================================================

-- Extensions (safe no-ops on Supabase if already installed)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- emr_drafts
CREATE TABLE IF NOT EXISTS public.emr_drafts (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id              UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    version                 INTEGER NOT NULL DEFAULT 1,
    status                  TEXT NOT NULL DEFAULT 'draft',
    chief_complaint         TEXT,
    history_present_illness TEXT,
    past_medical_history    JSONB,
    medications             JSONB,
    allergies               JSONB,
    vital_signs             JSONB,
    review_of_systems       JSONB,
    physical_examination    JSONB,
    assessment              TEXT,
    diagnoses               JSONB,
    treatment_plan          JSONB,
    medications_prescribed  JSONB,
    follow_up_plan          TEXT,
    patient_instructions    TEXT,
    model_used              TEXT,
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

-- final_emrs
CREATE TABLE IF NOT EXISTS public.final_emrs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID NOT NULL UNIQUE REFERENCES public.sessions(id),
    draft_id        UUID NOT NULL REFERENCES public.emr_drafts(id),
    doctor_id       UUID NOT NULL REFERENCES public.users(id),
    patient_id      UUID NOT NULL REFERENCES public.users(id),
    emr_content     JSONB NOT NULL,
    emr_checksum    TEXT,
    approved_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_by     UUID NOT NULL REFERENCES public.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- icd_mappings
CREATE TABLE IF NOT EXISTS public.icd_mappings (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    emr_draft_id        UUID REFERENCES public.emr_drafts(id),
    diagnosis_text      TEXT NOT NULL,
    icd_code            TEXT,
    icd_description     TEXT,
    match_method        TEXT,
    confidence_score    NUMERIC(5,4),
    is_primary          BOOLEAN NOT NULL DEFAULT FALSE,
    approval_status     TEXT NOT NULL DEFAULT 'pending',
    approved_by         UUID REFERENCES public.users(id),
    approved_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- treatment_suggestions
CREATE TABLE IF NOT EXISTS public.treatment_suggestions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    emr_draft_id        UUID REFERENCES public.emr_drafts(id),
    suggestion_type     TEXT,
    title               TEXT NOT NULL,
    description         TEXT,
    rationale           TEXT,
    evidence_basis      TEXT,
    priority            TEXT,
    contraindications   TEXT,
    model_used          TEXT,
    approval_status     TEXT NOT NULL DEFAULT 'pending',
    approved_by         UUID REFERENCES public.users(id),
    approved_at         TIMESTAMPTZ,
    doctor_notes        TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- patient_summaries
CREATE TABLE IF NOT EXISTS public.patient_summaries (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          UUID NOT NULL UNIQUE REFERENCES public.sessions(id),
    summary_text        TEXT NOT NULL,
    key_takeaways       JSONB,
    medications_list    JSONB,
    follow_up_date      DATE,
    follow_up_notes     TEXT,
    warnings            JSONB,
    model_used          TEXT,
    approval_status     TEXT NOT NULL DEFAULT 'pending',
    approved_by         UUID REFERENCES public.users(id),
    approved_at         TIMESTAMPTZ,
    sent_to_patient_at  TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    sender_id           UUID REFERENCES public.users(id),
    session_id          UUID REFERENCES public.sessions(id),
    notification_type   TEXT NOT NULL,
    title               TEXT NOT NULL,
    body                TEXT,
    payload             JSONB,
    is_read             BOOLEAN NOT NULL DEFAULT FALSE,
    read_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- pre_session_insights (in case it isn't accessible for some deployments)
CREATE TABLE IF NOT EXISTS public.pre_session_insights (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    document_id         UUID NOT NULL REFERENCES public.medical_documents(id),
    summary             TEXT,
    risk_flags          JSONB,
    key_findings        JSONB,
    medications_found   JSONB,
    allergies_found     JSONB,
    model_used          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- doctor_notes (CRUD via /api/notes)
CREATE TABLE IF NOT EXISTS public.doctor_notes (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doctor_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    patient_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    session_id  UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
    notes       TEXT[] NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ws_connections / ws_events (optional; used by clear_db.py and future WS persistence)
CREATE TABLE IF NOT EXISTS public.ws_connections (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    session_id      UUID REFERENCES public.sessions(id),
    connection_id   TEXT NOT NULL,
    server_node     VARCHAR(100),
    status          TEXT NOT NULL DEFAULT 'connected',
    connected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    disconnected_at TIMESTAMPTZ,
    last_ping_at    TIMESTAMPTZ,
    user_agent      TEXT,
    ip_address      INET,
    metadata        JSONB
);

CREATE TABLE IF NOT EXISTS public.ws_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID REFERENCES public.sessions(id),
    sender_id       UUID REFERENCES public.users(id),
    connection_id   TEXT,
    event_type      TEXT NOT NULL,
    payload         JSONB NOT NULL DEFAULT '{}',
    delivered       BOOLEAN NOT NULL DEFAULT FALSE,
    delivered_at    TIMESTAMPTZ,
    error           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- DISABLE RLS on all public tables so service role key has full access
-- =============================================================================
ALTER TABLE IF EXISTS public.emr_drafts            DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.final_emrs            DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.icd_mappings          DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.treatment_suggestions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.patient_summaries     DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications         DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pre_session_insights  DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.doctor_notes          DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ws_connections        DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ws_events             DISABLE ROW LEVEL SECURITY;

-- Also disable RLS on existing public tables that had it enabled
ALTER TABLE IF EXISTS public.medical_documents     DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.transcript_chunks     DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.final_transcripts     DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- GRANT access to service role and anon role
-- =============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
    END IF;
END;
$$;
