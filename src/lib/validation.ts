import { z } from "zod";

export const MAX_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(new Date(d + "T00:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);

const coord = (min: number, max: number) =>
  z.preprocess((v) => (v === "" || v === undefined ? null : v), z.coerce.number().min(min).max(max).nullable());

/**
 * Report payload shared by the client form and the server action. The
 * database re-validates everything (create_report / update_report).
 * Issue messages are error codes translated by the UI.
 */
export const reportSchema = z
  .object({
    type: z.enum(["lost", "found"], { message: "validation:type" }),
    item_name: z.string().trim().min(2, "validation:item_name").max(120, "validation:item_name"),
    description: z.string().trim().min(10, "validation:description").max(2000, "validation:description"),
    category_id: z.string().uuid("validation:category"),
    color: z.string().trim().min(2, "validation:color").max(60, "validation:color"),
    distinguishing_features: z.string().trim().min(3, "validation:distinguishing_features").max(1000, "validation:distinguishing_features"),
    location_text: z.string().trim().min(2, "validation:location").max(200, "validation:location"),
    lat: coord(-90, 90),
    lng: coord(-180, 180),
    event_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "validation:event_date")
      .refine((d) => d <= addDays(today(), 1), "validation:event_date_future")
      .refine((d) => d >= addDays(today(), -365), "validation:event_date_old"),
    event_time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "validation:event_date")
      .nullable()
      .optional()
      .or(z.literal("").transform(() => null)),
    image_paths: z.array(z.string().min(3).max(300)).min(1, "validation:images_count").max(MAX_PHOTOS, "validation:images_count"),
    verification_notes: z.string().trim().max(1000).optional().nullable(),
  })
  .refine((v) => (v.lat === null) === (v.lng === null), { message: "validation:coordinates", path: ["lat"] })
  .refine((v) => new Set(v.image_paths).size === v.image_paths.length, { message: "validation:images_duplicate", path: ["image_paths"] });

export type ReportInput = z.infer<typeof reportSchema>;

export function validatePhotoFile(file: { type: string; size: number }): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return "validation:image_type";
  if (file.size > MAX_PHOTO_BYTES) return "validation:image_size";
  return null;
}

export const passwordSchema = z
  .string()
  .min(8, "weakPassword")
  .max(72, "weakPassword")
  .regex(/[A-Za-z؀-ۿ]/, "weakPassword")
  .regex(/\d/, "weakPassword");

export const registerSchema = z
  .object({
    full_name: z.string().trim().min(2, "nameRequired").max(120, "nameRequired"),
    email: z.string().trim().toLowerCase().email("invalidEmail"),
    password: passwordSchema,
    confirm_password: z.string(),
    university_id: z.string().uuid("universityRequired"),
    member_type: z.enum(["student", "employee", "faculty"]).default("student"),
    faculty: z.string().trim().max(120).optional().or(z.literal("")),
    academic_year: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().min(1).max(10).optional()),
    terms: z.literal("on", { errorMap: () => ({ message: "termsRequired" }) }),
  })
  .refine((v) => v.password === v.confirm_password, { message: "passwordMismatch", path: ["confirm_password"] });

export const profileSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  member_type: z.enum(["student", "employee", "faculty"]),
  faculty: z.string().trim().max(120).optional().or(z.literal("")),
  academic_year: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(1).max(10).nullable()),
});

/** Safe in-app redirect target (prevents open redirects). */
export function safeNext(next: unknown, fallback = "/reports") {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}
