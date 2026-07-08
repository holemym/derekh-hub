import { getLocale } from "next-intl/server";
import { hebrewDate } from "@/lib/zmanim";
import { formatDate } from "@/lib/format";
import Header from "./Header";
import TabNav from "./TabNav";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import AppChrome from "./AppChrome";

/**
 * One app, two shells (DESIGN.md §Responsive).
 *
 *  - Mobile (`< lg`): sticky Header, centered ~680px column, bottom TabNav —
 *    unchanged from before.
 *  - Desktop (`≥ lg`): left Sidebar + slim Topbar, wide content column.
 *
 * Both are rendered and toggled with responsive classes so it's genuinely the
 * same tree adapting, not two code paths. AppChrome hides ALL chrome (Header,
 * TabNav, Sidebar, Topbar) on the public/auth routes — those stay single-column
 * with no chrome, exactly as before.
 */
export default async function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const now = new Date();
  const hd = hebrewDate(now).he;
  const greg = formatDate(now, locale);

  return (
    <div className="flex min-h-dvh w-full">
      {/* Desktop sidebar (hidden < lg, hidden on public routes) */}
      <AppChrome>
        <Sidebar />
      </AppChrome>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header (hidden ≥ lg, hidden on public routes) */}
        <AppChrome>
          <Header />
        </AppChrome>

        {/* Desktop topbar (hidden < lg, hidden on public routes) */}
        <AppChrome>
          <Topbar hebrewDate={hd} gregDate={greg} />
        </AppChrome>

        {/* Content. Mobile: centered narrow column with bottom-tab padding.
            Desktop: wider padded column, no bottom padding (no tab bar). */}
        <main className="flex-1 px-4 pb-28 pt-5 lg:px-8 lg:pb-12 lg:pt-6">
          <div className="mx-auto w-full max-w-[680px] lg:max-w-[1080px]">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom tabs (hidden ≥ lg, hidden on public routes) */}
      <AppChrome>
        <TabNav />
      </AppChrome>
    </div>
  );
}
