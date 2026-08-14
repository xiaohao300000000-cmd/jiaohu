from hermes.plugins.pupu_readonly import register


class RecordingContext:
    def __init__(self):
        self.tools = []

    def register_tool(self, **definition):
        self.tools.append(definition)


def test_registers_only_read_only_tools():
    context = RecordingContext()

    register(context)

    assert {tool["name"] for tool in context.tools} == {
        "pupu_capabilities",
        "pupu_auth_status",
        "pupu_search_catalog",
        "pupu_search_meal_catalog",
        "pupu_get_product",
        "pupu_read_cart",
        "submit_final_plan",
    }
    assert all(tool["toolset"] == "pupu_readonly" for tool in context.tools)
    assert all(callable(tool["handler"]) for tool in context.tools)


def test_tool_schemas_do_not_expose_mutation_inputs():
    context = RecordingContext()
    register(context)

    serialized = repr([tool["schema"] for tool in context.tools]).lower()

    assert "cart.add" not in serialized
    assert "checkout" not in serialized
    assert "payment" not in serialized
    assert "login.request_code" not in serialized


def test_handlers_delegate_only_to_expected_operations(monkeypatch):
    calls = []

    def fake_run(operation, arguments):
        calls.append((operation, arguments))
        return '{"ok": true}'

    monkeypatch.setattr("hermes.plugins.pupu_readonly.run_pupu", fake_run)
    context = RecordingContext()
    register(context)

    for tool in context.tools:
        if tool["name"] != "submit_final_plan":
            tool["handler"]({}, task_id="ignored")

    assert [operation for operation, _ in calls] == [
        "capabilities",
        "login.status",
        "catalog.search",
        "catalog.meal-search",
        "catalog.detail",
        "cart.read",
    ]
