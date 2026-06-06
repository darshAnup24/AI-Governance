"""
Shared Prometheus metrics for the proxy and background workers.
"""

from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram, ProcessCollector

PROM_REGISTRY = CollectorRegistry()
ProcessCollector(registry=PROM_REGISTRY)

AUDIT_QUEUE_DEPTH = Gauge(
    "airlock_audit_queue_depth",
    "Current audit event queue depth",
    registry=PROM_REGISTRY,
)
AUDIT_DEAD_LETTER_DEPTH = Gauge(
    "airlock_audit_dead_letter_depth",
    "Current audit dead-letter stream depth",
    registry=PROM_REGISTRY,
)
AUDIT_CONSUMER_LAG = Gauge(
    "airlock_audit_consumer_lag",
    "Current audit consumer lag based on pending entries",
    registry=PROM_REGISTRY,
)
AUDIT_CONSUMER_HEALTH = Gauge(
    "airlock_audit_consumer_health",
    "Audit consumer health status: 1 healthy, 0 unhealthy",
    ["consumer"],
    registry=PROM_REGISTRY,
)
AUDIT_EVENTS_EMITTED = Counter(
    "airlock_audit_events_emitted_total",
    "Total audit events emitted to Redis Streams",
    registry=PROM_REGISTRY,
)
AUDIT_EMIT_FAILURES = Counter(
    "airlock_audit_emit_failures_total",
    "Total audit event publish failures",
    registry=PROM_REGISTRY,
)
AUDIT_FALLBACK_WRITES = Counter(
    "airlock_audit_fallback_writes_total",
    "Total audit events written to local fallback storage",
    registry=PROM_REGISTRY,
)
AUDIT_EVENTS_PROCESSED = Counter(
    "airlock_audit_events_processed_total",
    "Total audit events written by background consumers",
    ["result"],
    registry=PROM_REGISTRY,
)
AUDIT_RETRIES = Counter(
    "airlock_audit_retries_total",
    "Total audit event retry attempts",
    registry=PROM_REGISTRY,
)
AUDIT_DEAD_LETTERED = Counter(
    "airlock_audit_dead_lettered_total",
    "Total audit events moved to the dead-letter stream",
    registry=PROM_REGISTRY,
)
AUDIT_PENDING_CLAIMS = Counter(
    "airlock_audit_pending_claims_total",
    "Total abandoned pending audit messages claimed by a consumer",
    registry=PROM_REGISTRY,
)
AUDIT_BATCH_WRITE_DURATION = Histogram(
    "airlock_audit_batch_write_duration_seconds",
    "Duration of audit batch writes to durable storage",
    registry=PROM_REGISTRY,
)
AUDIT_BATCH_SIZE = Histogram(
    "airlock_audit_batch_size",
    "Number of events written per audit batch",
    registry=PROM_REGISTRY,
)
EVENT_STREAM_EVENTS_EMITTED = Counter(
    "airlock_event_stream_events_emitted_total",
    "Total versioned events emitted to Redis Streams",
    ["stream", "event_type"],
    registry=PROM_REGISTRY,
)
EVENT_STREAM_EVENTS_PROCESSED = Counter(
    "airlock_event_stream_events_processed_total",
    "Total events processed by stream workers",
    ["stream", "result"],
    registry=PROM_REGISTRY,
)
EVENT_STREAM_RETRIES = Counter(
    "airlock_event_stream_retries_total",
    "Total event stream retry attempts",
    ["stream"],
    registry=PROM_REGISTRY,
)
EVENT_STREAM_DEAD_LETTERED = Counter(
    "airlock_event_stream_dead_lettered_total",
    "Total events moved to stream dead-letter queues",
    ["stream"],
    registry=PROM_REGISTRY,
)
EVENT_STREAM_QUEUE_DEPTH = Gauge(
    "airlock_event_stream_queue_depth",
    "Current queue depth by event stream",
    ["stream", "queue_type"],
    registry=PROM_REGISTRY,
)
EVENT_STREAM_CONSUMER_LAG = Gauge(
    "airlock_event_stream_consumer_lag",
    "Current pending consumer lag by event stream",
    ["stream"],
    registry=PROM_REGISTRY,
)
EVENT_STREAM_CONSUMER_HEALTH = Gauge(
    "airlock_event_stream_consumer_health",
    "Health of stream consumers: 1 healthy, 0 unhealthy",
    ["stream", "consumer"],
    registry=PROM_REGISTRY,
)
EVENT_STREAM_BATCH_SIZE = Histogram(
    "airlock_event_stream_batch_size",
    "Number of events processed per worker batch",
    ["stream"],
    registry=PROM_REGISTRY,
)
EVENT_STREAM_BATCH_DURATION = Histogram(
    "airlock_event_stream_batch_duration_seconds",
    "Batch handler duration by event stream",
    ["stream"],
    registry=PROM_REGISTRY,
)
UPSTREAM_LATENCY = Histogram(
    "proxy_upstream_latency_ms",
    "Upstream LLM provider latency in milliseconds",
    ["provider"],
    registry=PROM_REGISTRY,
)
UPSTREAM_ERRORS = Counter(
    "proxy_upstream_errors_total",
    "Total upstream provider errors",
    ["provider", "status_code"],
    registry=PROM_REGISTRY,
)
CACHE_HITS = Counter(
    "proxy_cache_hits_total",
    "Total semantic cache hits",
    registry=PROM_REGISTRY,
)
CACHE_MISSES = Counter(
    "proxy_cache_misses_total",
    "Total semantic cache misses",
    registry=PROM_REGISTRY,
)
REQUEST_COUNT = Counter(
    "proxy_requests_total",
    "Total proxy requests",
    ["method", "endpoint", "status"],
    registry=PROM_REGISTRY,
)
REQUEST_LATENCY = Histogram(
    "proxy_request_duration_seconds",
    "Request duration in seconds",
    ["method", "endpoint"],
    registry=PROM_REGISTRY,
)
DETECTION_HITS = Counter(
    "airlock_detection_hits_total",
    "Total detection hits by category and tier",
    ["category", "tier"],
    registry=PROM_REGISTRY,
)
DETECTION_LATENCY = Histogram(
    "airlock_detection_latency_ms",
    "Detection pipeline latency in milliseconds",
    ["tier"],
    registry=PROM_REGISTRY,
)
POLICY_BLOCKS = Counter(
    "airlock_policy_blocks_total",
    "Total policy blocks by rule",
    ["rule_id", "action"],
    registry=PROM_REGISTRY,
)
SDK_VERBOSE_USAGE = Counter(
    "airlock_sdk_verbose_error_usage",
    "Total verbose error responses served",
    [],
    registry=PROM_REGISTRY,
)
