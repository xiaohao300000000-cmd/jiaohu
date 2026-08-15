from types import SimpleNamespace

from hermes.plugins.pupu_cli.provider import run_pupu


class RecordingRunner:
    def __init__(self, completed):
        self.completed = completed
        self.calls = []

    def __call__(self, argv):
        self.calls.append(argv)
        return self.completed


def test_forwards_any_cli_operation_and_arguments_without_a_whitelist(monkeypatch):
    monkeypatch.setenv("PUPU_CLI_PATH", "/opt/pupu/bin/pupu")
    runner = RecordingRunner(
        SimpleNamespace(returncode=0, stdout='{"ok":true}', stderr="")
    )

    result = run_pupu(
        "cart add",
        ["--store-product-id", "sku-1", "--quantity", "2", "--json"],
        runner=runner,
    )

    assert runner.calls == [[
        "/opt/pupu/bin/pupu",
        "cart",
        "add",
        "--store-product-id",
        "sku-1",
        "--quantity",
        "2",
        "--json",
    ]]
    assert result == '{"ok":true}'


def test_returns_cli_failure_output_unchanged(monkeypatch):
    monkeypatch.setenv("PUPU_CLI_PATH", "/opt/pupu/bin/pupu")
    runner = RecordingRunner(
        SimpleNamespace(returncode=2, stdout='{"ok":false}', stderr="usage error")
    )

    assert run_pupu("coupon claim", ["--json"], runner=runner) == '{"ok":false}'
