"use client";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { liftRestriction, restrictUser, setRole } from "@/app/actions/admin";
import { useI18n } from "@/i18n/client";
import type { Role } from "@/lib/types";

export function UserAdminRow({ userId, role, restricted, assignableRoles }: { userId: string; role: Role; restricted: boolean; assignableRoles: Role[] }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-start gap-2">
      {assignableRoles.length > 0 && (
        <ActionForm action={setRole} className="flex gap-1">
          <input type="hidden" name="user_id" value={userId} />
          <select name="role" defaultValue={role} className="input py-1.5 text-xs" aria-label={t("admin.role")}>
            {assignableRoles.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
          </select>
          <SubmitButton className="btn-ghost btn-sm">{t("admin.setRole")}</SubmitButton>
        </ActionForm>
      )}
      {restricted ? (
        <ActionForm action={liftRestriction}>
          <input type="hidden" name="user_id" value={userId} />
          <SubmitButton className="btn-ghost btn-sm">{t("admin.liftRestriction")}</SubmitButton>
        </ActionForm>
      ) : (
        <details>
          <summary className="btn-ghost btn-sm cursor-pointer list-none">{t("admin.restrict")}</summary>
          <ActionForm action={restrictUser} className="mt-2 flex flex-wrap gap-1">
            <input type="hidden" name="user_id" value={userId} />
            <input name="days" type="number" min={1} max={90} defaultValue={7} className="input w-20 py-1.5 text-xs" aria-label={t("admin.restrictDays")} />
            <input name="reason" required minLength={3} maxLength={300} className="input py-1.5 text-xs" placeholder={t("admin.restrictReason")} />
            <SubmitButton className="btn-amber btn-sm">{t("admin.restrict")}</SubmitButton>
          </ActionForm>
        </details>
      )}
    </div>
  );
}
