import { z } from "zod";
import { PaymentStructure } from "@/types/bounty";

// Zod schema for validation
export const createBountySchema = z.object({
  title: z
    .string()
    .min(1, { message: "Title is required" })
    .max(100, { message: "Title too long" }),
  category: z
    .string()
    .min(1, { message: "Category is required" })
    .max(50, { message: "Category too long" }),
  value: z
    .bigint({ required_error: "Value is required" })
    .refine((val) => val > 0n, { message: "Value must be greater than 0" }),
  token: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, { message: "Invalid token address" }),
  paymentStructure: z.nativeEnum(PaymentStructure),
  upfrontAmount: z.bigint().optional().default(0n),
  completionAmount: z.bigint().optional().default(0n),
})
.refine(
  (data) =>
    data.paymentStructure !== PaymentStructure.Split ||
    data.upfrontAmount + data.completionAmount === data.value,
  {
    message: "Upfront + Completion must equal Total Value when Split payment",
    path: ["completionAmount"], // error anchor
  }
);

// Type inference for convenience
export type CreateBountyFormValues = z.infer<typeof createBountySchema>;

// Form validation schema (for string inputs before conversion to bigint)
export const bountyFormSchema = z.object({
  title: z
    .string()
    .min(1, { message: "Title is required" })
    .max(100, { message: "Title too long" }),
  category: z
    .string()
    .min(1, { message: "Category is required" })
    .max(50, { message: "Category too long" }),
  value: z.object({
    amount: z
      .string()
      .min(1, { message: "Amount is required" })
      .refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
        message: "Amount must be a positive number"
      }),
    token: z.enum(['SYSTEM', 'SELF']),
  }),
  paymentStructure: z.nativeEnum(PaymentStructure),
  upfrontAmount: z.string().optional().default('0'),
  completionAmount: z.string().optional().default('0'),
  description: z.string().optional(),
  deadline: z.string().optional(),
  requirements: z.array(z.string()).optional().default([]),
  questions: z.array(z.string()).optional().default([]),
  work_requirements: z.array(z.string()).optional().default([]),
  funding_source: z.object({
    type: z.enum(['wallet', 'pod_treasury']),
    podId: z.string().optional(),
  }),
})
.refine(
  (data) => {
    if (data.paymentStructure !== PaymentStructure.Split) return true;
    const upfront = Number(data.upfrontAmount || '0');
    const completion = Number(data.completionAmount || '0');
    const total = Number(data.value.amount);
    return Math.abs((upfront + completion) - total) < 0.000001; // Handle floating point precision
  },
  {
    message: "Upfront + Completion must equal Total Value when Split payment",
    path: ["completionAmount"],
  }
);

export type BountyFormValues = z.infer<typeof bountyFormSchema>;