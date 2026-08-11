import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { abortOnClientDisconnect } from "./request-lifecycle";

class RequestProbe extends EventEmitter {}

class ResponseProbe extends EventEmitter {
  writableEnded = false;
}

describe("abortOnClientDisconnect", () => {
  it("does not abort when a fully-read request emits close", () => {
    const request = new RequestProbe();
    const response = new ResponseProbe();
    const controller = new AbortController();

    abortOnClientDisconnect(request, response, controller);
    request.emit("close");

    expect(controller.signal.aborted).toBe(false);
  });

  it("aborts when the incoming request is aborted", () => {
    const request = new RequestProbe();
    const response = new ResponseProbe();
    const controller = new AbortController();

    abortOnClientDisconnect(request, response, controller);
    request.emit("aborted");

    expect(controller.signal.aborted).toBe(true);
  });

  it("aborts when the response closes before the stream ends", () => {
    const request = new RequestProbe();
    const response = new ResponseProbe();
    const controller = new AbortController();

    abortOnClientDisconnect(request, response, controller);
    response.emit("close");

    expect(controller.signal.aborted).toBe(true);
  });

  it("does not abort after a response ended normally", () => {
    const request = new RequestProbe();
    const response = new ResponseProbe();
    const controller = new AbortController();

    abortOnClientDisconnect(request, response, controller);
    response.writableEnded = true;
    response.emit("close");

    expect(controller.signal.aborted).toBe(false);
  });
});
