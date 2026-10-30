// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { I18nProvider } from "@/i18n/client";

vi.mock("@/app/actions/auth", () => ({ register: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const { RegisterForm } = await import("@/app/(auth)/register/RegisterForm");

const universities = [
  { id: "11111111-1111-4111-8111-111111111111", name_en: "Assiut National University", name_ar: "جامعة أسيوط الأهلية" },
  { id: "22222222-2222-4222-8222-222222222222", name_en: "Assiut University", name_ar: "جامعة أسيوط" },
  { id: "33333333-3333-4333-8333-333333333333", name_en: "Sphinx University", name_ar: "جامعة سفينكس" },
];

describe("registration university selection", () => {
  afterEach(cleanup);

  it.each([
    ["ar", "الجامعة", "name_ar"],
    ["en", "University", "name_en"],
  ] as const)("lists every university from the database (%s) with its id as the value", (locale, label, key) => {
    render(<I18nProvider locale={locale}><RegisterForm universities={universities} /></I18nProvider>);
    const select = screen.getByLabelText(label) as HTMLSelectElement;
    expect(select.name).toBe("university_id");
    for (const u of universities) {
      const option = within(select).getByRole("option", { name: u[key] }) as HTMLOptionElement;
      expect(option.value).toBe(u.id);
    }
  });
});
