# Logging Standards and Implementation Guide

This document outlines the existing logging practices in the `scheduler` and `optimiser` services and defines the standards to be adopted for consistent and effective logging across the application.

## 1. Existing Logging Infrastructure Analysis

Based on an analysis of the codebase (July 2024), the logging implementations differ significantly between the two main services:

### 1.1. Scheduler Service (`apps/scheduler`)

*   **Library:** Custom wrapper around `console.log` (`apps/scheduler/src/utils/logger.ts`).
*   **Configuration:**
    *   Log level controlled by `LOG_LEVEL` environment variable (defaults to `INFO`).
    *   Manual formatting: `[<timestamp>] [<LEVEL>] <message> [...optionalParams]`. Timestamp uses `date-fns`.
    *   Outputs directly to `stdout`/`stderr`.
*   **Context:** Timestamps and levels are automatic. Other context (function names, IDs) is manually added to the message string or parameters.
*   **Usage:** The `logger` utility is imported and used across modules (`orchestrator`, `availability`, `payload`, `results`, etc.) with methods like `logger.info()`, `logger.debug()`.
*   **HTTP Logging:** Middleware (`morgan`) is present but commented out; no active request logging.

### 1.2. Optimizer Service (`apps/optimiser`)

*   **Library:** Standard Python `logging` module (via Uvicorn/FastAPI defaults) **AND** extensive use of direct `print()` statements (`apps/optimiser/main.py`).
*   **Configuration:**
    *   No explicit `logging` configuration found in the application code. Relies on Uvicorn defaults (console handler, INFO level, standard format).
    *   `print()` statements bypass the `logging` framework entirely.
*   **Context:** Uvicorn logs include timestamps, levels, and request info (for access logs). `print()` statements only contain manually included information.
*   **Usage:**
    *   `print()` is used heavily for application logic logging (payload details, constraints, solver steps, results, errors).
    *   `logging` module usage is minimal or non-existent within the application code itself.
*   **HTTP Logging:** Default Uvicorn access logs are active.

### 1.3. Summary Comparison

| Feature             | Scheduler (`apps/scheduler`)        | Optimizer (`apps/optimiser`)                        |
| :------------------ | :---------------------------------- | :-------------------------------------------------- |
| **Primary Library** | Custom `console.log` wrapper        | `print()`, standard `logging` (Uvicorn default)   |
| **Configuration**   | `LOG_LEVEL` env var                 | Uvicorn defaults / `print()` (none)               |
| **Formatting**      | Manual structured text              | Uvicorn default + Raw `print()` output            |
| **Structure**       | Relatively consistent               | Inconsistent (mix of Uvicorn format & raw print)  |
| **Context**         | Manual injection                    | Manual injection (`print()`) / Minimal (Uvicorn)    |
| **Request Logging** | No (Commented out)                  | Yes (Uvicorn default)                               |

## 2. Proposed Logging Standards

To improve consistency, observability, and debugging capabilities, the following standards should be adopted across **both** services:

### 2.1. Core Principles

*   **Structured Logging:** All logs MUST be structured (preferably JSON format, especially for file/cloud transports) to allow for easy parsing, filtering, and analysis by log management systems.
*   **Consistent Context:** Logs MUST include consistent contextual information.
*   **Appropriate Levels:** Use standard log levels correctly.
*   **Performance:** Logging should have minimal performance impact in production. Avoid excessive logging, especially at `DEBUG` level in performance-critical paths unless needed for specific diagnostics.

### 2.2. Standard Log Levels

*   **`ERROR`**: Unrecoverable errors that prevent normal operation or indicate a critical failure. Should always be investigated. Include stack traces where applicable.
*   **`WARN`**: Potential issues or unexpected situations that do not necessarily halt execution but may require attention (e.g., recoverable errors, deprecated usage, minor configuration issues).
*   **`INFO`**: High-level information about the application's lifecycle and significant events (e.g., service start/stop, major processing steps initiated/completed, configuration loaded, significant state changes like optimization run completion). Keep INFO logs relatively low-volume.
*   **`DEBUG`**: Detailed diagnostic information useful for developers during troubleshooting (e.g., function entry/exit points, variable values, detailed step-by-step execution, external API call details, detailed payload summaries). Should be disabled by default in production but configurable.

### 2.3. Required Context Fields

All log entries MUST include:

*   `timestamp`: ISO 8601 format with millisecond precision (automatically added by most loggers).
*   `level`: Log level string (e.g., "info", "error").
*   `message`: The main log message string.
*   `service`: Name of the service (e.g., "scheduler", "optimiser").
*   **Optional but Recommended:**
    *   `functionName`: Name of the function/method where the log originated.
    *   `correlationId` / `traceId`: ID to correlate logs across services or within a request lifecycle (Needs implementation).
    *   Relevant business IDs (e.g., `jobId`, `technicianId`, `orderId`, `date`).
    *   Error details (`error.message`, `error.stack`, `error.code`) for ERROR logs.

### 2.4. Implementation Libraries

*   **Scheduler (TypeScript):** Standardize on **Pino**. Refactor `apps/scheduler/src/utils/logger.ts` to properly use Pino, potentially removing the custom wrapper or making it a thin layer over Pino. Ensure JSON formatting and context binding. Use `pino-http` (or `express-pino-logger`) for request logging.
*   **Optimizer (Python):** Standardize on the built-in **`logging`** module.
    *   Remove all `print()` statements used for logging.
    *   Configure `logging` properly (e.g., using `dictConfig` or file configuration) with a JSON formatter (like `python-json-logger`).
    *   Set up appropriate handlers (e.g., `StreamHandler` for console, potentially `FileHandler` or cloud-specific handlers).
    *   Use `logging.getLogger(__name__)` consistently.
    *   Inject context using the `extra` dictionary or LogRecord adapters/filters.
    *   Integrate with FastAPI/Uvicorn for consistent request/application logging.

### 2.5. Formatting

*   **Production/Files:** JSON format is REQUIRED.
*   **Development Console:** Human-readable, pretty-printed format (like Pino's default pretty print or Python's standard formatters) is acceptable for ease of local development, but the underlying structure should remain consistent.

### 2.6. Examples (Conceptual)

```typescript
// Scheduler (Pino)
import { logger } from './utils/logger'; // Assuming logger is now a configured Pino instance

const schedulerLogger = logger.child({ service: 'scheduler' });

function processJob(jobId: number) {
  const childLogger = schedulerLogger.child({ functionName: 'processJob', jobId });
  childLogger.info('Starting job processing');
  try {
    // ... processing logic ...
    childLogger.debug({ data: 'some_details' }, 'Processing step completed');
    // ...
    childLogger.info('Job processing finished successfully');
  } catch (error: any) {
    childLogger.error({ err: error }, 'Job processing failed');
  }
}
```

```python
# Optimizer (logging)
import logging

# Assume logging is configured elsewhere with JSON formatter
logger = logging.getLogger(__name__) 

def optimize_schedule(payload: dict):
    logger.info("Starting schedule optimization", extra={'service': 'optimiser', 'functionName': 'optimize_schedule'})
    try:
        item_count = len(payload.get('items', []))
        logger.debug("Received payload", extra={'itemCount': item_count, 'payloadSnippet': str(payload)[:100]}) 
        # ... optimization logic ...
        logger.info("Optimization finished", extra={'status': 'success'})
    except Exception as e:
        logger.error("Optimization failed", exc_info=True, extra={'payloadSnippet': str(payload)[:100]}) 
        # exc_info=True adds stack trace
```

## 3. Next Steps

1.  Review and refine these proposed standards (Subtask 1.5).
2.  Implement the standardized loggers in both services (Tasks 2 onwards address specific logging points based on these standards).
3.  Remove old logging implementations (`print()` in optimizer, potentially refactor scheduler logger).
4.  Configure log collection and analysis tools (e.g., Cloud Logging, Datadog, Splunk) to parse the standardized JSON logs. 