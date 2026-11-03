import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthContext";
import { LoginScreen } from "@/features/auth/LoginScreen";
import { ItemsProvider } from "@/features/data/ItemsContext";
import { ClockProvider } from "@/features/data/ClockContext";
import { ModalProvider } from "@/features/modals/ModalContext";
import { ModalHost } from "@/features/modals/ModalHost";
import { TodayScreen } from "@/features/today/components/TodayScreen";
import { Loading } from "@/components/ui/misc";
import { ToastHost } from "@/components/ui/ToastHost";
import { firebaseConfigured } from "@/config/firebase";
import { useT } from "@/i18n";
import { AppLayout } from "./AppLayout";
import { paths } from "./paths";

const CalendarScreen = lazy(() => import("@/features/calendar/components/CalendarScreen"));
const EventsScreen = lazy(() => import("@/features/events/components/EventsScreen"));
const DetailScreen = lazy(() => import("@/features/detail/components/DetailScreen"));

export function AppRouter() {
  const { user, loading } = useAuth();
  const t = useT();

  if (!firebaseConfigured) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <p className="card" style={{ maxWidth: 420 }}>
          {t.app.notConfigured}
        </p>
      </div>
    );
  }
  if (loading) return <Loading full />;
  if (!user) return <LoginScreen />;

  return (
    <BrowserRouter>
      <ClockProvider>
        <ItemsProvider>
          <ModalProvider>
            <Routes>
              <Route element={<AppLayout />}>
                <Route index element={<Navigate to={paths.today} replace />} />
                <Route path={paths.today} element={<TodayScreen />} />
                <Route
                  path={paths.calendar}
                  element={
                    <Suspense fallback={<Loading />}>
                      <CalendarScreen />
                    </Suspense>
                  }
                />
                <Route
                  path={paths.events}
                  element={
                    <Suspense fallback={<Loading />}>
                      <EventsScreen />
                    </Suspense>
                  }
                />
                <Route
                  path={`${paths.events}/:id`}
                  element={
                    <Suspense fallback={<Loading />}>
                      <DetailScreen />
                    </Suspense>
                  }
                />
                <Route path="*" element={<Navigate to={paths.today} replace />} />
              </Route>
            </Routes>
            <ModalHost />
            <ToastHost />
          </ModalProvider>
        </ItemsProvider>
      </ClockProvider>
    </BrowserRouter>
  );
}
