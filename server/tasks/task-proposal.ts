import { z } from "zod";

const capabilitySchema = z.enum([
  "task.plan.submit",
  "commerce.catalog.search",
  "commerce.catalog.meal-search",
  "commerce.cart.read",
  "commerce.cart.prepare",
  "commerce.cart.write",
  "commerce.checkout.preview",
  "commerce.order.create",
  "commerce.payment.read",
  "delivery.quote",
  "delivery.order.create",
  "home.device.read",
  "home.device.control",
  "calendar.event.read",
  "calendar.event.create",
]);

export const taskProposalSchema = z.object({
  operation: z.enum(["start", "continue", "research", "revise"]),
  domain: z.enum([
    "general",
    "commerce",
    "delivery",
    "home_automation",
    "calendar",
  ]),
  goal: z.enum([
    "advice",
    "find_products",
    "revise_plan",
    "prepare_cart",
    "create_order",
  ]),
  requestedCapabilities: z.array(capabilitySchema).max(8),
  contextPatch: z.object({
    peopleCount: z.number().int().min(1).max(100).optional(),
    budgetCents: z.number().int().nonnegative().optional(),
    dietaryRequirements: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
    requirementsToAdd: z.array(z.string().trim().min(1).max(500)).max(30).optional(),
  }).strict(),
}).strict();

export type TaskProposal = z.infer<typeof taskProposalSchema>;
