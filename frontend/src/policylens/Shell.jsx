import React from "react";
import { Feather, Settings, HelpCircle, ChevronDown } from "lucide-react";
import { CSS } from "./styles.js";
import { NAV } from "./data.jsx";
import { StoreProvider, useStore } from "./store.jsx";
import UploadPage from "./UploadPage.jsx";
import ReviewPage from "./ReviewPage.jsx";
import FinalPage  from "./FinalPage.jsx";
import PolicyPage from "./PolicyPage.jsx";

function AppShell() {
  const { page, setPage } = useStore();
  return (
    <div className="pl-shell">
      {/* Top bar — brand + avatar only, sidebar handles navigation */}
      <div className="pl-topbar">
        <div className="pl-brand">
          <div className="pl-brand-badge">
            <Feather size={14} strokeWidth={2.4} aria-hidden="true" />
          </div>
          <div className="pl-brand-name">PolicyLens</div>
        </div>
        <div className="pl-avatarwrap">
          <div className="pl-avatar">T</div>
          <ChevronDown size={14} color="var(--ink-3)" aria-hidden="true" />
        </div>
      </div>

      <div className="pl-body">
        {/* Icon sidebar — sole navigation */}
        <aside className="pl-sidebar">
          <div className="pl-side-top">
            {NAV.map(({ key, label, Icon }) => (
              <button
                key={key}
                className="pl-sideitem"
                aria-current={page === key ? "page" : undefined}
                onClick={() => setPage(key)}
              >
                <Icon size={17} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          <div className="pl-side-bottom">
            <button className="pl-sideitem"><Settings   size={17} aria-hidden="true" />Settings</button>
            <button className="pl-sideitem"><HelpCircle size={17} aria-hidden="true" />Help</button>
          </div>
        </aside>

        <main className="pl-main">
          {page === "upload" && <UploadPage />}
          {page === "review" && <ReviewPage />}
          {page === "final"  && <FinalPage />}
          {page === "policy" && <PolicyPage />}
        </main>
      </div>
    </div>
  );
}

export default function PolicyLensApp() {
  return (
    <div className="pl">
      <style>{CSS}</style>
      <StoreProvider>
        <AppShell />
      </StoreProvider>
    </div>
  );
}
