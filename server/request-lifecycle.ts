interface RequestLifecycleEvents {
  once(event: "aborted", listener: () => void): unknown;
  off(event: "aborted", listener: () => void): unknown;
}

interface ResponseLifecycleEvents {
  readonly writableEnded: boolean;
  once(event: "close", listener: () => void): unknown;
  off(event: "close", listener: () => void): unknown;
}

export function abortOnClientDisconnect(
  request: RequestLifecycleEvents,
  response: ResponseLifecycleEvents,
  controller: AbortController,
): () => void {
  const abortRequest = () => controller.abort();
  const abortResponse = () => {
    if (!response.writableEnded) controller.abort();
  };

  request.once("aborted", abortRequest);
  response.once("close", abortResponse);

  return () => {
    request.off("aborted", abortRequest);
    response.off("close", abortResponse);
  };
}
