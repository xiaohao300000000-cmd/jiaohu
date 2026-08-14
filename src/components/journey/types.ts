import type { PresentationMode } from "../home/presentation";
import type { TaskSnapshot } from "../../domain/task-contract";

export type JourneyState =
  | "idle"
  | "receiving"
  | "reasoning"
  | "assembling"
  | "ready"
  | "awaiting_input"
  | "error"
  | "interrupted";

export type TraceStatus = "pending" | "active" | "complete";

export interface TraceEntry {
  id: string;
  label: string;
  detail?: string;
  status: TraceStatus;
}

export interface JourneyResultItem {
  id: string;
  name: string;
  detail: string;
  price: number;
}

export interface PartialJourneyResult {
  title?: string;
  summary?: string;
  totalAmount?: number;
  currency?: string;
  items?: JourneyResultItem[];
}

export interface JourneyResult {
  title: string;
  summary: string;
  totalAmount: number;
  currency: string;
  items: JourneyResultItem[];
}

export type PupuLoginPhase =
  | "phone" | "requesting" | "captcha" | "applying_captcha"
  | "sms" | "verifying" | "connected" | "error";

export interface SavedPupuAddressPresentation {
  phase: "loading" | "choose" | "selecting" | "selected" | "error";
  addresses: Array<{
    id: string;
    label: string;
    region: string;
    detailHint: string;
    phoneSuffix: string;
  }>;
}

export interface PupuLoginPresentation {
  phase: PupuLoginPhase;
  attemptId?: string;
  captchaUrl?: string;
  retryAfterSeconds?: number;
  error?: { code: string; message: string; retryable: boolean };
}
export type JourneyPresentation =
  | {
      capability: "pupu";
      component: "pupu.login";
      mode: PresentationMode;
      dataSource: "live";
      payload: PupuLoginPresentation;
    }
  | {
      capability: "pupu";
      component: "pupu.address";
      mode: PresentationMode;
      dataSource: "live";
      payload: SavedPupuAddressPresentation;
    }
  | {
      capability: "generic";
      component: "journey.result";
      mode: PresentationMode;
      dataSource: "live";
      payload: JourneyResult;
    };

export type AwaitingInput =
  | {
      kind: "approval";
      title: string;
      impact: string;
      target: string;
      amount?: number;
      currency?: string;
      approvalId: string;
    }
  | {
      kind: "clarification";
      title: string;
      question: string;
    };

export type JourneyErrorKind =
  "offline" | "timeout" | "provider" | "invalid_result" | "unknown";

export interface JourneyError {
  kind: JourneyErrorKind;
  message: string;
  reference?: string;
}

export type JourneyEvent =
  | { type: "request.sent"; requestId: string; text: string }
  | { type: "stream.started"; requestId: string; runId: string }
  | { type: "task.updated"; requestId: string; task: TaskSnapshot }
  | {
      type: "presentation.updated";
      requestId: string;
      presentation: JourneyPresentation;
    }
  | { type: "trace.updated"; requestId: string; entries: TraceEntry[] }
  | {
      type: "result.partial";
      requestId: string;
      result: PartialJourneyResult;
    }
  | {
      type: "approval.requested";
      requestId: string;
      input: AwaitingInput;
    }
  | {
      type: "approval.responded";
      requestId: string;
      approved: boolean;
    }
  | {
      type: "stream.finished";
      requestId: string;
      result: JourneyResult;
    }
  | {
      type: "stream.failed";
      requestId: string;
      error: JourneyError;
    }
  | {
      type: "stream.interrupted";
      requestId: string;
      replacementRequestId?: string;
    }
  | { type: "retry.requested"; requestId: string };

export interface JourneySnapshot {
  state: JourneyState;
  activeRequestId: string | null;
  requestText: string;
  runId: string | null;
  task: TaskSnapshot | null;
  trace: TraceEntry[];
  partialResult: PartialJourneyResult | null;
  result: JourneyResult | null;
  awaitingInput: AwaitingInput | null;
  presentation: JourneyPresentation | null;
  error: JourneyError | null;
  replacementRequestId: string | null;
}
