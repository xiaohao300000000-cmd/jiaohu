from hermes.plugins.pupu_cli import register


class RecordingContext:
    def __init__(self):
        self.tools = []

    def register_tool(self, **definition):
        self.tools.append(definition)


def test_registers_one_complete_pupu_cli_connection_tool():
    context = RecordingContext()

    register(context)

    assert len(context.tools) == 1
    tool = context.tools[0]
    assert tool["name"] == "pupu_cli"
    assert tool["toolset"] == "pupu_cli"
    assert tool["schema"]["parameters"] == {
        "type": "object",
        "properties": {
            "operation": {"type": "string"},
            "arguments": {
                "type": "array",
                "items": {"type": "string"},
            },
        },
        "required": ["operation", "arguments"],
        "additionalProperties": False,
    }


def test_schema_tells_hermes_to_use_command_group_as_operation():
    context = RecordingContext()
    register(context)
    description = context.tools[0]["schema"]["description"]
    assert 'operation="catalog"' in description
    assert 'arguments=["search"' in description


def test_tool_delegates_the_operation_chosen_by_hermes(monkeypatch):
    calls = []

    def fake_run(operation, arguments):
        calls.append((operation, arguments))
        return "cli output"

    monkeypatch.setattr("hermes.plugins.pupu_cli.run_pupu", fake_run)
    context = RecordingContext()
    register(context)

    result = context.tools[0]["handler"]({
        "operation": "checkout create-invite-pay",
        "arguments": ["--preview-id", "preview-1", "--json"],
    })

    assert calls == [(
        "checkout create-invite-pay",
        ["--preview-id", "preview-1", "--json"],
    )]
