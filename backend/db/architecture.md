# Smart EMR + AI Diagnostic Assistant — Architecture Reference

---

## 1. ER DIAGRAM (Text Form)

```
public.users (id)
 ├── public.doctor_profiles        [1:1  on user_id]
 ├── public.patient_profiles       [1:1  on user_id]
 ├── public.refresh_tokens         [1:N  on user_id]
 │
 ├── public.sessions (doctor_id, patient_id → users.id)
 │    ├── public.session_state_history   [1:N on session_id]
 │    ├── comms.ws_connections           [1:N on session_id]
 │    ├── comms.ws_events                [1:N on session_id]
 │    ├── public.session_document_shares [1:N on session_id]
 │    │    └── public.medical_documents  [N:1 on document_id]
 │    ├── public.transcript_chunks       [1:N on session_id]
 │    ├── public.final_transcripts       [1:1 on session_id]
 │    ├── ai.pre_session_insights        [1:N on session_id]
 │    ├── ai.jobs                        [1:N on session_id]
 │    ├── emr.emr_drafts                 [1:N on session_id, versioned]
 │    │    ├── emr.icd_mappings          [1:N on emr_draft_id]
 │    │    └── emr.treatment_suggestions [1:N on emr_draft_id]
 │    ├── emr.final_emrs                 [1:1 on session_id]
 │    │    └── emr.export_logs           [1:N on final_emr_id]
 │    ├── emr.patient_summaries          [1:1 on session_id]
 │    ├── comms.notifications            [1:N on session_id]
 │    └── public.integration_logs        [1:N on session_id]
 │
public.medical_documents (patient_id → users.id)
 └── ai.pre_session_insights             [1:N on document_id]

emr.icd_codes (reference table)
 └── emr.icd_mappings                   [N:1 on icd_code_id]

ai.prompt_templates
 └── ai.jobs                            [N:1 on prompt_template_id]

audit.audit_logs (append-only, references users.id as actor)
```

---

## 2. REAL-TIME WEBSOCKET ARCHITECTURE

### 2.1 Connection Flow

```
Client (browser)
  │
  │  1. HTTP GET /ws?token=<JWT>
  ▼
API Gateway (nginx / AWS ALB)
  │
  │  2. Upgrade: websocket
  ▼
WebSocket Server (FastAPI / Node + Socket.io)
  │
  │  3. Validate JWT → extract user_id, role
  │  4. INSERT into comms.ws_connections
  │  5. Subscribe to Redis channel:  user:{user_id}
  │                                  session:{session_id}  (if in-session)
  │
  │  6. Emit HELLO event back to client
  ▼
Redis Pub/Sub
  │
  ├── Any server pod publishes to channel
  └── All pods subscribed deliver to their connected clients
```

### 2.2 Auth Strategy for WebSockets

1. Client sends short-lived **JWT access token** as query param on handshake  
   `wss://api.emr.io/ws?token=<jwt>`
2. Server verifies signature, expiry, and role claim before upgrading
3. A **Redis session key** `ws_session:{connection_id}` is set with 30s TTL
4. Client sends `PING` every 20s; server resets TTL and responds `PONG`
5. On JWT expiry mid-session, client sends `REFRESH_TOKEN` event to rotate without disconnecting

### 2.3 Horizontal Scaling with Redis Pub/Sub

```
Pod A (user Alice connected)     Pod B (user Bob connected)
      │                                    │
      └──── Redis Pub/Sub channel ─────────┘
                  session:{session_id}

When doctor on Pod A sends transcript chunk:
  1. Publish to Redis: PUBLISH session:{id} <payload>
  2. Pod B (patient subscribed) receives message
  3. Pod B delivers to patient's WebSocket connection
```

For 10,000 concurrent sessions:
- **Redis Cluster** with 6 shards, channels partitioned by `session_id % N`
- **Socket.io adapter** (`@socket.io/redis-adapter`) or FastAPI + `broadcaster` library
- WebSocket servers behind ALB with **sticky sessions disabled** (Redis handles routing)

---

## 3. WEBSOCKET EVENT JSON EXAMPLES

### SESSION_REQUESTED
```json
{
  "event": "SESSION_REQUESTED",
  "session_id": "550e8400-e29b-41d4-a716-446655440001",
  "payload": {
    "doctor": {
      "id": "550e8400-e29b-41d4-a716-446655440010",
      "name": "Dr. Sarah Chen",
      "email": "s.chen@hospital.org",
      "specialty": "Internal Medicine"
    },
    "message": "Dr. Sarah Chen wants to start a session with you.",
    "chief_complaint": "Follow-up for hypertension management",
    "expires_at": "2026-02-21T14:30:00Z"
  },
  "timestamp": "2026-02-21T14:15:00Z"
}
```

### SESSION_ACCEPTED
```json
{
  "event": "SESSION_ACCEPTED",
  "session_id": "550e8400-e29b-41d4-a716-446655440001",
  "payload": {
    "patient": {
      "id": "550e8400-e29b-41d4-a716-446655440020",
      "name": "John Doe",
      "mrn": "MRN-00042"
    },
    "session_status": "accepted",
    "accepted_at": "2026-02-21T14:16:05Z"
  },
  "timestamp": "2026-02-21T14:16:05Z"
}
```

### SESSION_REJECTED
```json
{
  "event": "SESSION_REJECTED",
  "session_id": "550e8400-e29b-41d4-a716-446655440001",
  "payload": {
    "reason": "Patient unavailable",
    "rejected_at": "2026-02-21T14:17:00Z"
  },
  "timestamp": "2026-02-21T14:17:00Z"
}
```

### FILE_SHARED
```json
{
  "event": "FILE_SHARED",
  "session_id": "550e8400-e29b-41d4-a716-446655440001",
  "payload": {
    "document_id": "doc-uuid-001",
    "title": "CBC Report - Jan 2026",
    "document_type": "lab_report",
    "file_mime_type": "application/pdf",
    "file_size_bytes": 245760,
    "shared_by": "patient_user_id",
    "preview_url": "https://storage.emr.io/presigned/...",
    "preview_url_exp_at": "2026-02-21T14:45:00Z",
    "ai_insight_status": "processing"
  },
  "timestamp": "2026-02-21T14:18:00Z"
}
```

### TRANSCRIPT_CHUNK
```json
{
  "event": "TRANSCRIPT_CHUNK",
  "session_id": "550e8400-e29b-41d4-a716-446655440001",
  "payload": {
    "chunk_index": 42,
    "speaker_role": "doctor",
    "speaker_user_id": "550e8400-e29b-41d4-a716-446655440010",
    "raw_text": "How long have you been experiencing these headaches?",
    "start_time_ms": 125400,
    "end_time_ms": 128200,
    "confidence_score": 0.9873,
    "is_final": true,
    "language_code": "en-US",
    "asr_model": "google-medical-asr-v2"
  },
  "timestamp": "2026-02-21T14:22:05Z"
}
```

### SESSION_ENDED
```json
{
  "event": "SESSION_ENDED",
  "session_id": "550e8400-e29b-41d4-a716-446655440001",
  "payload": {
    "ended_by": "doctor_user_id",
    "duration_seconds": 1842,
    "total_transcript_chunks": 218,
    "ai_pipeline_status": "queued",
    "ai_job_ids": [
      "job-emr-generation-uuid",
      "job-icd-mapping-uuid",
      "job-treatment-uuid",
      "job-patient-summary-uuid"
    ]
  },
  "timestamp": "2026-02-21T14:52:42Z"
}
```

---

## 4. TRANSCRIPT STORAGE DESIGN

### 4.1 Streaming Ingestion Flow

```
Google MedASR (gRPC stream)
  │
  │  word-level interim results (is_final=false)
  ▼
Transcript Ingestion Service
  │
  ├── Write interim chunks to transcript_chunks (is_final=false)
  │   → Overwritten when final result arrives for same time range
  ├── Emit TRANSCRIPT_CHUNK event via Redis → WebSocket
  └── On session end: mark all chunks is_final=true
                      compile final_transcripts row
```

### 4.2 Speaker Diarization

- Google MedASR returns speaker tags (speaker_0, speaker_1)
- On session join, `ws_connections` maps connection to `user_id`
- Diarization resolver matches speaker tags to doctor/patient `user_id`
  by cross-referencing session join order and audio channel
- Stored in `transcript_chunks.speaker_role` + `speaker_user_id`

### 4.3 Confidence & Quality

| Field             | Description                              |
|-------------------|------------------------------------------|
| `confidence_score`| 0–1 from ASR model (word avg)            |
| `is_final`        | FALSE = interim (streaming), TRUE = done |
| `asr_model`       | Model name + version for reproducibility |
| `metadata`        | Word-level timestamps, alternative texts |

### 4.4 Final Transcript Compilation

Triggered automatically when `session.status` → `ended`:

```sql
INSERT INTO public.final_transcripts (session_id, full_text, total_chunks, ...)
SELECT
    session_id,
    string_agg(raw_text, ' ' ORDER BY chunk_index) AS full_text,
    COUNT(*) AS total_chunks,
    SUM(duration_ms) AS total_duration_ms,
    AVG(confidence_score) AS avg_confidence
FROM public.transcript_chunks
WHERE session_id = $1
  AND is_final = TRUE
GROUP BY session_id;
```

---

## 5. LLM ORCHESTRATION LAYER

### 5.1 Job Queue Flow

```
SESSION_ENDED event
       │
       ▼
Job Dispatcher (Celery / BullMQ / AWS SQS)
       │
       ├── [Priority 1] pre_session_document_insight  ← already done during session
       │
       └── [Post-session — sequential dependencies]
           │
           ├── 1. post_session_emr_generation
           │       Input:  final_transcript + document insights
           │       Output: emr.emr_drafts (version 1)
           │
           ├── 2. icd_mapping   (depends on emr_draft)
           │       Input:  diagnoses[] from emr_draft
           │       Output: emr.icd_mappings
           │
           ├── 3. treatment_suggestion (parallel with icd_mapping)
           │       Input:  diagnoses + medications + patient history
           │       Output: emr.treatment_suggestions
           │
           └── 4. patient_summary_generation (depends on approved EMR)
                   Input:  approved final_emr
                   Output: emr.patient_summaries
```

### 5.2 Pre-Session Pipeline

```
Patient selects file → FILE_SHARED event
        │
        ▼
   ai.jobs INSERT (type=pre_session_document_insight, status=queued)
        │
        ▼
   Worker picks up job:
     1. Fetch file from storage (pre-signed URL, decrypt)
     2. Parse: OCR (Tesseract/Google Doc AI) + structured extraction
     3. Call LLM with prompt_template[pre_session_document_insight]
     4. Store result in ai.pre_session_insights
     5. Update ai.jobs status=completed
        │
        ▼
   Emit AI_INSIGHT_READY via WebSocket to doctor
```

### 5.3 Retry Strategy

```python
RETRY_DELAYS = [30, 120, 600]  # seconds: 30s, 2min, 10min

if job.attempt_count < job.max_attempts:
    job.next_retry_at = NOW() + RETRY_DELAYS[job.attempt_count]
    job.status = 'retrying'
    job.attempt_count += 1
else:
    job.status = 'failed'
    alert_on_call_engineer(job)
```

### 5.4 Model + Prompt Version Tracking

Every `ai.jobs` row records:
- `model_name` — e.g., `gpt-4o`, `claude-3-5-sonnet`
- `model_version` — API snapshot date
- `prompt_template_id` — FK to `ai.prompt_templates`
- `tokens_used` + `cost_usd` — billing tracking

Rolling back a bad model: update `ai.prompt_templates.is_active = FALSE`, 
set new active version → all new jobs use new template.

---

## 6. ICD CODE MAPPING STRATEGY

### 6.1 Matching Pipeline (3-stage)

```
LLM-extracted diagnosis text: "Type 2 diabetes with peripheral neuropathy"
          │
          ▼
STAGE 1 — LLM Direct Mapping
  Prompt: "Map this diagnosis to the most specific ICD-10-CM code.
           Return: {code, description, confidence}"
  → E11.40 (0.94 confidence)
          │
          ▼ (if confidence < 0.80)
STAGE 2 — Full-Text Search
  SELECT * FROM emr.icd_codes
  WHERE search_vector @@ plainto_tsquery('english', $1)
  ORDER BY ts_rank(…) DESC LIMIT 5
          │
          ▼ (if no good FTS match)
STAGE 3 — Trigram Fuzzy Match
  SELECT *, similarity(short_desc, $1) AS sim
  FROM emr.icd_codes
  WHERE short_desc % $1         -- pg_trgm operator
  ORDER BY sim DESC LIMIT 5
```

### 6.2 Doctor Override Flow

```sql
UPDATE emr.icd_mappings
SET icd_code_id     = $new_icd_id,
    icd_code        = $new_code,
    icd_description = $new_desc,
    doctor_override = TRUE,
    original_ai_code = icd_code,    -- preserve AI suggestion
    approval_status = 'approved',
    approved_by     = $doctor_id,
    approved_at     = NOW()
WHERE id = $mapping_id;
```

---

## 7. SAMPLE EMR JSON (emr_drafts.emr_content)

```json
{
  "version": 2,
  "generated_at": "2026-02-21T15:10:00Z",
  "model_used": "gpt-4o-2025-11",
  "chief_complaint": "Worsening headaches for 3 weeks and elevated BP readings at home",
  "history_present_illness": "John Doe, 52-year-old male with known hypertension, presents with a 3-week history of progressively worsening bilateral occipital headaches. He reports checking his blood pressure at home, with readings ranging from 155/95 to 170/105 mmHg despite compliance with his current antihypertensive regimen...",
  "past_medical_history": [
    { "condition": "Essential hypertension", "onset": "2018", "status": "active" },
    { "condition": "Type 2 diabetes mellitus", "onset": "2020", "status": "active" },
    { "condition": "Appendectomy", "type": "surgical", "date": "1995" }
  ],
  "medications": [
    { "name": "Amlodipine", "dose": "5mg", "route": "oral", "frequency": "once daily", "start_date": "2021-03-10" },
    { "name": "Metformin", "dose": "1000mg", "route": "oral", "frequency": "twice daily", "start_date": "2020-07-15" }
  ],
  "allergies": [
    { "allergen": "Penicillin", "reaction": "Rash", "severity": "moderate" }
  ],
  "vital_signs": {
    "blood_pressure": "168/98 mmHg",
    "heart_rate": "82 bpm",
    "respiratory_rate": "16/min",
    "temperature_c": 36.8,
    "spo2_percent": 98,
    "weight_kg": 88.5,
    "height_cm": 175,
    "bmi": 28.9
  },
  "physical_examination": {
    "general": "Alert, well-nourished male in no acute distress",
    "cardiovascular": "Regular rate and rhythm, no murmurs",
    "neurological": "CN II-XII intact, no focal deficits",
    "fundoscopy": "Grade II hypertensive retinopathy"
  },
  "diagnoses": [
    {
      "description": "Hypertensive crisis — uncontrolled essential hypertension",
      "icd_code": "I10",
      "type": "primary",
      "confidence": 0.97
    },
    {
      "description": "Hypertensive headache",
      "icd_code": "G44.309",
      "type": "secondary",
      "confidence": 0.88
    }
  ],
  "treatment_plan": [
    {
      "action": "Increase Amlodipine to 10mg once daily",
      "type": "medication_adjustment",
      "priority": "high",
      "rationale": "Subtherapeutic response on current 5mg dose"
    },
    {
      "action": "Add Lisinopril 10mg once daily",
      "type": "new_medication",
      "priority": "high",
      "rationale": "Combination therapy for uncontrolled hypertension; renal protection in diabetic patient"
    },
    {
      "action": "24-hour ambulatory blood pressure monitoring",
      "type": "investigation",
      "priority": "medium"
    }
  ],
  "follow_up_plan": "Reviewed in 4 weeks or sooner if BP > 180/110 or severe headache",
  "transcript_reference_id": "final-transcript-uuid-001",
  "attachments": [
    { "document_id": "doc-uuid-001", "role": "CBC Report" },
    { "document_id": "doc-uuid-002", "role": "Previous ECG" }
  ]
}
```

---

## 8. SAMPLE FHIR R4 EXPORT JSON

```json
{
  "resourceType": "Bundle",
  "id": "emr-export-bundle-001",
  "type": "document",
  "timestamp": "2026-02-21T15:30:00Z",
  "entry": [
    {
      "fullUrl": "urn:uuid:composition-001",
      "resource": {
        "resourceType": "Composition",
        "id": "composition-001",
        "status": "final",
        "type": {
          "coding": [{ "system": "http://loinc.org", "code": "34133-9", "display": "Summary of episode note" }]
        },
        "subject": { "reference": "urn:uuid:patient-001" },
        "author": [{ "reference": "urn:uuid:practitioner-001" }],
        "date": "2026-02-21T15:00:00Z",
        "title": "Clinical Encounter Summary"
      }
    },
    {
      "fullUrl": "urn:uuid:patient-001",
      "resource": {
        "resourceType": "Patient",
        "id": "patient-001",
        "identifier": [{ "system": "urn:emr:mrn", "value": "MRN-00042" }],
        "name": [{ "family": "Doe", "given": ["John"] }],
        "birthDate": "1974-03-15",
        "gender": "male"
      }
    },
    {
      "fullUrl": "urn:uuid:practitioner-001",
      "resource": {
        "resourceType": "Practitioner",
        "id": "practitioner-001",
        "identifier": [{ "system": "http://hl7.org/fhir/sid/us-npi", "value": "1234567890" }],
        "name": [{ "family": "Chen", "given": ["Sarah"] }],
        "qualification": [{ "code": { "coding": [{ "display": "Internal Medicine" }] } }]
      }
    },
    {
      "fullUrl": "urn:uuid:condition-001",
      "resource": {
        "resourceType": "Condition",
        "id": "condition-001",
        "clinicalStatus": { "coding": [{ "code": "active" }] },
        "verificationStatus": { "coding": [{ "code": "confirmed" }] },
        "code": {
          "coding": [
            { "system": "http://hl7.org/fhir/sid/icd-10-cm", "code": "I10", "display": "Essential (primary) hypertension" }
          ]
        },
        "subject": { "reference": "urn:uuid:patient-001" },
        "onsetDateTime": "2018-01-01"
      }
    },
    {
      "fullUrl": "urn:uuid:medicationrequest-001",
      "resource": {
        "resourceType": "MedicationRequest",
        "id": "medicationrequest-001",
        "status": "active",
        "intent": "order",
        "medicationCodeableConcept": {
          "coding": [{ "system": "http://www.nlm.nih.gov/research/umls/rxnorm", "code": "17767", "display": "Amlodipine 10 MG" }]
        },
        "subject": { "reference": "urn:uuid:patient-001" },
        "requester": { "reference": "urn:uuid:practitioner-001" },
        "dosageInstruction": [{
          "text": "10mg once daily by mouth",
          "timing": { "code": { "coding": [{ "code": "QD", "display": "Every day" }] } },
          "route": { "coding": [{ "code": "26643006", "display": "Oral route" }] },
          "doseAndRate": [{ "doseQuantity": { "value": 10, "unit": "mg" } }]
        }]
      }
    },
    {
      "fullUrl": "urn:uuid:observation-bp-001",
      "resource": {
        "resourceType": "Observation",
        "id": "observation-bp-001",
        "status": "final",
        "category": [{ "coding": [{ "code": "vital-signs" }] }],
        "code": { "coding": [{ "system": "http://loinc.org", "code": "55284-4", "display": "Blood pressure" }] },
        "subject": { "reference": "urn:uuid:patient-001" },
        "effectiveDateTime": "2026-02-21T14:05:00Z",
        "component": [
          {
            "code": { "coding": [{ "system": "http://loinc.org", "code": "8480-6", "display": "Systolic BP" }] },
            "valueQuantity": { "value": 168, "unit": "mmHg" }
          },
          {
            "code": { "coding": [{ "system": "http://loinc.org", "code": "8462-4", "display": "Diastolic BP" }] },
            "valueQuantity": { "value": 98, "unit": "mmHg" }
          }
        ]
      }
    }
  ]
}
```

---

## 9. SECURITY & COMPLIANCE

### 9.1 Encryption

| Layer              | Mechanism                                    |
|--------------------|----------------------------------------------|
| In transit         | TLS 1.3 (all APIs + WebSockets)              |
| At rest (DB)       | PostgreSQL TDE (RDS encryption, AES-256)     |
| At rest (files)    | AES-256-GCM per-file key via AWS KMS         |
| PHI fields         | `pgcrypto` `pgp_sym_encrypt` for extra-sensitive columns |
| Passwords          | Argon2id (min cost factor 3, 64MB memory)    |
| Tokens             | SHA-256 hash stored, raw token never persisted |

### 9.2 RBAC Matrix

| Resource                 | Admin | Doctor (own patients) | Patient (own) | Auditor |
|--------------------------|-------|-----------------------|---------------|---------|
| Session create           | ✓     | ✓                     | ✗             | ✗       |
| Session read             | ✓     | own only              | own only      | ✓ (read)|
| Medical documents        | ✓     | shared in session     | own only      | ✗       |
| Transcript chunks        | ✓     | own sessions          | ✗             | ✓ (read)|
| EMR draft read/edit      | ✓     | own sessions          | ✗             | ✗       |
| EMR final read           | ✓     | own sessions          | ✗             | ✓       |
| Patient summary          | ✓     | own sessions (write)  | own (read)    | ✗       |
| Audit logs               | ✓     | ✗                     | own (read)    | ✓       |
| ICD codes (reference)    | ✓     | read                  | ✗             | read    |

### 9.3 Data Retention Policy

```
transcript_chunks        → 7 years (HIPAA minimum)
final_transcripts        → 7 years
emr_drafts               → 7 years
final_emrs               → 10 years (many state laws)
audit_logs               → 6 years (HIPAA)
medical_documents        → 7 years or patient lifetime
ws_events                → 90 days (operational only)
refresh_tokens (expired) → 30 days then purge
```

### 9.4 PHI Isolation

- All PHI tables use RLS (see schema)
- Set `app.current_user_id` in every DB connection via middleware:
  ```python
  await conn.execute(f"SET LOCAL app.current_user_id = '{user_id}'")
  ```
- `audit.audit_logs.phi_accessed = TRUE` on every PHI table trigger
- Separate DB roles: `app_write`, `app_readonly`, `audit_readonly`, `superuser` — no app code uses superuser

---

## 10. SCALABILITY DESIGN

### 10.1 For 10,000 Concurrent Sessions

| Component                 | Strategy                                                  |
|---------------------------|-----------------------------------------------------------|
| WebSocket servers         | 20 pods × 500 connections each; horizontal auto-scale     |
| Redis Pub/Sub             | Redis Cluster (6 shards), channel-sharded by session_id   |
| `transcript_chunks`       | Partition by `created_at` monthly; hot partition on NVMe  |
| `ws_events`               | TimescaleDB or Citus extension for hypertable             |
| AI job workers            | 50 Celery workers, GPU workers for LLM inference          |
| Read replicas             | 2× RDS read replicas for doctor dashboards / analytics    |
| Connection pooling        | PgBouncer (transaction mode, 10k max client conns)        |
| File storage              | S3 Multi-Region with Transfer Acceleration                |

### 10.2 LLM Latency Handling

- EMR generation is **async** — doctor sees "AI Processing..." banner
- Estimated latency: 30–90s for full EMR generation
- WebSocket `AI_INSIGHT_READY` / `EMR_DRAFT_READY` event pushes result to doctor
- **Streaming LLM responses** (OpenAI Streaming API) for pre-session insights to reduce perceived latency

### 10.3 Fault Tolerance

```
AI Job fails → retry with exponential backoff (max 3 attempts)
           → on final failure: alert + manual queue for human review
           → session is NOT blocked; doctor still has transcript

WebSocket pod crashes → Redis TTL expires → client auto-reconnects
                     → ws_connections row closed with disconnected_at

DB primary failover → RDS Multi-AZ automatic failover (< 60s)
                   → PgBouncer reconnects to new primary
```

---

## 11. TRADE-OFF ANALYSIS

| Decision                                   | Choice Made                        | Trade-off                                                    |
|--------------------------------------------|------------------------------------|--------------------------------------------------------------|
| Transcript storage: streaming chunks vs full | Both (chunks + compiled final)    | Higher storage cost; enables real-time display + LLM input  |
| EMR versioning: event sourcing vs snapshots | Snapshots per version              | Simpler queries; loses field-level diff history              |
| ICD mapping: LLM-only vs hybrid            | 3-stage hybrid (LLM → FTS → fuzzy) | Higher complexity; much better accuracy on rare diagnoses    |
| WebSocket scaling: sticky sessions vs Redis | Redis Pub/Sub, no sticky sessions  | Redis is SPOF if misconfigured; gains full horizontal scale  |
| Async AI vs inline AI                      | Fully async (job queue)            | Doctor waits 30-90s; avoids blocking session close on LLM   |
| Schema: single DB vs schema-separated      | 4 schemas (public/emr/ai/comms)    | Same DB instance; clean namespace without multi-DB overhead  |
| Audit: app-level vs trigger-level          | DB triggers (append-only)          | Cannot be bypassed by app bugs; slightly higher write latency|
| Final EMR: mutable vs immutable            | Immutable (amendment creates new row) | Storage cost; full legal integrity, HIPAA non-repudiation  |
