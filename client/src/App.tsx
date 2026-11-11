import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import EditPostPage from "@/pages/EditPostPage";
import HomePage from "@/pages/HomePage";
import ImportPage from "@/pages/ImportPage";
import PostPage from "@/pages/PostPage";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

function Router() {
  return (
    <Switch>
      <Route path="/">{() => <HomePage mode="home" />}</Route>
      <Route path="/category/:slug">{() => <HomePage mode="home" />}</Route>
      <Route path="/search">{() => <HomePage mode="search" />}</Route>
      <Route path="/post/:id" component={PostPage} />
      <Route path="/admin" component={ImportPage} />
      <Route path="/admin/edit/:id" component={EditPostPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster position="top-center" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
