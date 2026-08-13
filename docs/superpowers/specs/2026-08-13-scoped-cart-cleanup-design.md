# Scoped cart cleanup design

The cleanup command is an explicitly approved cart mutation. It accepts one normalized cart item, resolves the saved login account, and binds execution to the selected store, place, and receiver before issuing a short-lived `cart_write` approval. It removes only the named `store_product_id`, verifies the SKU is absent by reading the cart again, and returns the standard typed CLI envelope.

Cleanup execution uses the nine product identifiers captured by the completed test run. Before each removal, the current cart is read and the identifier must still be present. After each removal, the scoped command performs its own readback. No unrelated cart line is changed, login state remains intact, and order creation remains disabled until a new three-SKU plan is produced.

Failure is fail-closed: invalid bindings, missing current items, approval mismatch, provider rejection, or inconclusive readback stop the sequence without retrying the mutation blindly.
