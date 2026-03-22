-- ============================================================================
-- SEVAमित्र Backend - Consolidated Production Schema
-- Target: PostgreSQL / Supabase (public schema)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- ENUMS
-- ============================================================================
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('doctor', 'patient', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE user_status AS ENUM ('pending_verification', 'active', 'inactive', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE gender_type AS ENUM ('male', 'female', 'other', 'prefer_not_to_say');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE session_status AS ENUM (
        'pending',
        'accepted',
        'rejected',
        'active',
        'ended',
        'processing',
        'completed',
        'cancelled',
        'expired'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
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
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE document_status AS ENUM ('uploaded', 'processing', 'ready', 'failed', 'deleted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE speaker_role AS ENUM ('doctor', 'patient', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
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
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- USERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.users (
    id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email               VARCHAR(255) NOT NULL UNIQUE,
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
    deleted_at          TIMESTAMPTZ,
    created_by          UUID REFERENCES public.users(id),
    modified_by         UUID REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users(status);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON public.users(created_at DESC);

CREATE TABLE IF NOT EXISTS public.doctor_profiles (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
    license_number          VARCHAR(100) NOT NULL UNIQUE,
    specialty               VARCHAR(150),
    sub_specialty           VARCHAR(150),
    hospital_affiliation    VARCHAR(200),
    department              VARCHAR(150),
    years_of_experience     SMALLINT CHECK (years_of_experience >= 0 AND years_of_experience <= 80),
    bio                     TEXT,
    is_available            BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doctor_profiles_specialty ON public.doctor_profiles(specialty);

CREATE TABLE IF NOT EXISTS public.patient_profiles (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                     UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
    mrn                         VARCHAR(50) UNIQUE,
    blood_type                  VARCHAR(5),
    height_cm                   NUMERIC(5,1) CHECK (height_cm IS NULL OR height_cm BETWEEN 30 AND 300),
    weight_kg                   NUMERIC(5,1) CHECK (weight_kg IS NULL OR weight_kg BETWEEN 1 AND 500),
    emergency_contact_name      VARCHAR(200),
    emergency_contact_phone     VARCHAR(30),
    emergency_contact_relation  VARCHAR(50),
    insurance_provider          VARCHAR(200),
    insurance_policy_number     VARCHAR(100),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_profiles_mrn ON public.patient_profiles(mrn);

-- ============================================================================
-- SESSION CORE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sessions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doctor_id           UUID NOT NULL REFERENCES public.users(id),
    patient_id          UUID NOT NULL REFERENCES public.users(id),
    status              session_status NOT NULL DEFAULT 'pending',
    title               VARCHAR(300),
    chief_complaint     TEXT,
    started_at          TIMESTAMPTZ,
    ended_at            TIMESTAMPTZ,
    duration_seconds    INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
    rejection_reason    TEXT,
    request_expires_at  TIMESTAMPTZ,
    is_emergency        BOOLEAN NOT NULL DEFAULT FALSE,
    session_notes       TEXT,
    recording_url       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID REFERENCES public.users(id),
    modified_by         UUID REFERENCES public.users(id),
    CONSTRAINT chk_session_doctor_patient CHECK (doctor_id <> patient_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_doctor_status_created ON public.sessions(doctor_id, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_patient_status_created ON public.sessions(patient_id, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_status_expires ON public.sessions(status, request_expires_at);

CREATE TABLE IF NOT EXISTS public.session_state_history (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    from_status     session_status,
    to_status       session_status NOT NULL,
    changed_by      UUID REFERENCES public.users(id),
    reason          TEXT,
    metadata        JSONB,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_state_history_session_changed_at ON public.session_state_history(session_id, changed_at DESC);

-- ============================================================================
-- DOCUMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.medical_documents (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id          UUID NOT NULL REFERENCES public.users(id),
    uploaded_by         UUID NOT NULL REFERENCES public.users(id),
    document_type       document_type NOT NULL DEFAULT 'other',
    status              document_status NOT NULL DEFAULT 'uploaded',
    title               VARCHAR(300) NOT NULL,
    description         TEXT,
    file_name           VARCHAR(500) NOT NULL,
    file_mime_type      VARCHAR(100) NOT NULL,
    file_size_bytes     BIGINT CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
    storage_bucket      VARCHAR(200),
    storage_key         TEXT NOT NULL,
    storage_url         TEXT,
    ocr_extracted_text  TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID REFERENCES public.users(id),
    modified_by         UUID REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS idx_medical_documents_patient_created ON public.medical_documents(patient_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_medical_documents_status ON public.medical_documents(status);
CREATE INDEX IF NOT EXISTS idx_medical_documents_type ON public.medical_documents(document_type);

CREATE TABLE IF NOT EXISTS public.session_document_shares (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    document_id     UUID NOT NULL REFERENCES public.medical_documents(id) ON DELETE CASCADE,
    shared_by       UUID NOT NULL REFERENCES public.users(id),
    revoked_at      TIMESTAMPTZ,
    revoked_by      UUID REFERENCES public.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_share_not_revoked_without_user CHECK (
        (revoked_at IS NULL AND revoked_by IS NULL) OR (revoked_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_session_document_share
    ON public.session_document_shares(session_id, document_id)
    WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_session_document_shares_document ON public.session_document_shares(document_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.pre_session_insights (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    document_id         UUID NOT NULL REFERENCES public.medical_documents(id) ON DELETE CASCADE,
    summary             TEXT,
    risk_flags          JSONB,
    key_findings        JSONB,
    medications_found   JSONB,
    allergies_found     JSONB,
    model_used          VARCHAR(150),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pre_session_insights_session_created ON public.pre_session_insights(session_id, created_at DESC);

-- ============================================================================
-- TRANSCRIPTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.transcript_chunks (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    chunk_index         INTEGER NOT NULL CHECK (chunk_index >= 0),
    speaker_role        speaker_role NOT NULL DEFAULT 'unknown',
    raw_text            TEXT NOT NULL,
    start_time_ms       INTEGER NOT NULL DEFAULT 0 CHECK (start_time_ms >= 0),
    end_time_ms         INTEGER NOT NULL DEFAULT 0 CHECK (end_time_ms >= 0),
    confidence_score    NUMERIC(5,4) CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
    is_final            BOOLEAN NOT NULL DEFAULT FALSE,
    language_code       VARCHAR(16) DEFAULT 'en-US',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transcript_chunks_session_chunk ON public.transcript_chunks(session_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_transcript_chunks_session_created ON public.transcript_chunks(session_id, created_at);

CREATE TABLE IF NOT EXISTS public.final_transcripts (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          UUID NOT NULL UNIQUE REFERENCES public.sessions(id) ON DELETE CASCADE,
    full_text           TEXT NOT NULL,
    total_chunks        INTEGER NOT NULL DEFAULT 0 CHECK (total_chunks >= 0),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- EMR PIPELINE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.emr_drafts (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id              UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    version                 INTEGER NOT NULL DEFAULT 1,
    status                  VARCHAR(32) NOT NULL DEFAULT 'draft',
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
    model_used              VARCHAR(150),
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
    CONSTRAINT uq_emr_drafts_session_version UNIQUE (session_id, version)
);

CREATE INDEX IF NOT EXISTS idx_emr_drafts_session_status ON public.emr_drafts(session_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.final_emrs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID NOT NULL UNIQUE REFERENCES public.sessions(id) ON DELETE CASCADE,
    draft_id        UUID NOT NULL REFERENCES public.emr_drafts(id),
    doctor_id       UUID NOT NULL REFERENCES public.users(id),
    patient_id      UUID NOT NULL REFERENCES public.users(id),
    emr_content     JSONB NOT NULL,
    emr_checksum    TEXT,
    pdf_s3_key      TEXT,
    approved_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_by     UUID NOT NULL REFERENCES public.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_final_emrs_doctor_created ON public.final_emrs(doctor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_final_emrs_patient_created ON public.final_emrs(patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.icd_mappings (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    emr_draft_id        UUID REFERENCES public.emr_drafts(id) ON DELETE SET NULL,
    diagnosis_text      TEXT NOT NULL,
    icd_code            VARCHAR(20),
    icd_description     TEXT,
    match_method        VARCHAR(50),
    confidence_score    NUMERIC(5,4) CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
    is_primary          BOOLEAN NOT NULL DEFAULT FALSE,
    approval_status     VARCHAR(32) NOT NULL DEFAULT 'pending',
    approved_by         UUID REFERENCES public.users(id),
    approved_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_icd_mappings_session_created ON public.icd_mappings(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.treatment_suggestions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    emr_draft_id        UUID REFERENCES public.emr_drafts(id) ON DELETE SET NULL,
    suggestion_type     VARCHAR(100),
    title               TEXT NOT NULL,
    description         TEXT,
    rationale           TEXT,
    evidence_basis      TEXT,
    priority            VARCHAR(30),
    contraindications   TEXT,
    model_used          VARCHAR(150),
    approval_status     VARCHAR(32) NOT NULL DEFAULT 'pending',
    approved_by         UUID REFERENCES public.users(id),
    approved_at         TIMESTAMPTZ,
    doctor_notes        TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_treatment_suggestions_session_created ON public.treatment_suggestions(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.patient_summaries (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          UUID NOT NULL UNIQUE REFERENCES public.sessions(id) ON DELETE CASCADE,
    summary_text        TEXT NOT NULL,
    key_takeaways       JSONB,
    medications_list    JSONB,
    follow_up_date      DATE,
    follow_up_notes     TEXT,
    warnings            JSONB,
    model_used          VARCHAR(150),
    approval_status     VARCHAR(32) NOT NULL DEFAULT 'pending',
    approved_by         UUID REFERENCES public.users(id),
    approved_at         TIMESTAMPTZ,
    sent_to_patient_at  TIMESTAMPTZ,
    patient_read_at     TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- APP NOTIFICATIONS + NOTES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    sender_id           UUID REFERENCES public.users(id),
    session_id          UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
    notification_type   notification_type NOT NULL,
    title               TEXT NOT NULL,
    body                TEXT,
    payload             JSONB,
    is_read             BOOLEAN NOT NULL DEFAULT FALSE,
    read_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read_created
    ON public.notifications(recipient_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_session_created
    ON public.notifications(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.doctor_notes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doctor_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    patient_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    session_id      UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
    notes           JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doctor_notes_doctor_created ON public.doctor_notes(doctor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doctor_notes_patient_created ON public.doctor_notes(patient_id, created_at DESC);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT table_schema, table_name
        FROM information_schema.columns
        WHERE column_name = 'updated_at'
          AND table_schema = 'public'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at_%I ON %I.%I;', rec.table_name, rec.table_schema, rec.table_name);
        EXECUTE format(
            'CREATE TRIGGER trg_set_updated_at_%I
             BEFORE UPDATE ON %I.%I
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
            rec.table_name,
            rec.table_schema,
            rec.table_name
        );
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.compute_session_duration()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.started_at IS NOT NULL AND NEW.ended_at IS NOT NULL THEN
        NEW.duration_seconds = GREATEST(EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))::INTEGER, 0);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_session_duration ON public.sessions;
CREATE TRIGGER trg_compute_session_duration
    BEFORE UPDATE ON public.sessions
    FOR EACH ROW
    WHEN (NEW.ended_at IS DISTINCT FROM OLD.ended_at OR NEW.started_at IS DISTINCT FROM OLD.started_at)
    EXECUTE FUNCTION public.compute_session_duration();

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO public.users (id, email, role, first_name, last_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'patient'),
        COALESCE(NULLIF(NEW.raw_user_meta_data->>'first_name', ''), 'User'),
        COALESCE(NULLIF(NEW.raw_user_meta_data->>'last_name', ''), 'Account')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ============================================================================
-- RLS (optional with Supabase JWT context; service role bypasses by design)
-- ============================================================================
ALTER TABLE public.medical_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_owns_documents ON public.medical_documents;
CREATE POLICY patient_owns_documents ON public.medical_documents
FOR ALL USING (patient_id = auth.uid());

DROP POLICY IF EXISTS participant_reads_sessions ON public.sessions;
CREATE POLICY participant_reads_sessions ON public.sessions
FOR SELECT USING (doctor_id = auth.uid() OR patient_id = auth.uid());

DROP POLICY IF EXISTS recipient_reads_notifications ON public.notifications;
CREATE POLICY recipient_reads_notifications ON public.notifications
FOR SELECT USING (recipient_id = auth.uid());

-- ============================================================================
-- END
-- ============================================================================
