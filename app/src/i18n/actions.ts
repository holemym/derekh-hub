"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, LOCALES, type AppLocale } from "./request";

export async function setLocale(locale: string) {
  const next: AppLocale = (LOCALES as readonly string[]).includes(locale)
    ? (locale as AppLocale)
    : "en";
  const store = await cookies();
  store.set(LOCALE_COOKIE, next, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
