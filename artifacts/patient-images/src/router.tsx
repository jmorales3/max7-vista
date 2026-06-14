import { Switch, Route, Redirect } from "wouter";
import { AppLayout } from "@/components/layout";
import { useAuth } from "@/contexts/AuthContext";

import Patients from "@/pages/patients";
import PatientNew from "@/pages/patient-new";
import PatientDetail from "@/pages/patient-detail";
import PatientEdit from "@/pages/patient-edit";
import Capture from "@/pages/capture";
import Gallery from "@/pages/gallery";
import Editor from "@/pages/editor";
import Presentation from "@/pages/presentation";
import Presentations from "@/pages/presentations";
import Settings from "@/pages/settings";
import Manual from "@/pages/manual";
import NotFound from "@/pages/not-found";
import AdminUsers from "@/pages/admin/users";
import BulkImport from "@/pages/bulk-import";
import ImageLibrary from "@/pages/image-library";
import Templates from "@/pages/templates";
import TemplateDesigner from "@/pages/template-designer";
import TemplateDocumentPage from "@/pages/template-document";

function NotAuthorized() {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center space-y-3">
      <p className="text-xl font-semibold">Access Denied</p>
      <p className="text-muted-foreground text-sm">You do not have permission to view this page.</p>
    </div>
  );
}

function Router() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={() => <Redirect to="/patients" />} />
        <Route path="/patients" component={Patients} />
        <Route path="/patients/new" component={PatientNew} />
        <Route path="/patients/:id/edit" component={PatientEdit} />
        <Route path="/patients/:id" component={PatientDetail} />
        <Route path="/capture" component={Capture} />
        <Route path="/gallery" component={Gallery} />
        <Route path="/library" component={ImageLibrary} />
        <Route path="/editor/:id" component={Editor} />
        <Route path="/presentation/:id" component={Presentation} />
        <Route path="/presentations" component={Presentations} />
        <Route path="/settings" component={Settings} />
        <Route path="/manual" component={Manual} />
        <Route path="/admin/users" component={isAdmin ? AdminUsers : NotAuthorized} />
        <Route path="/import" component={BulkImport} />
        <Route path="/templates" component={Templates} />
        <Route path="/templates/:id" component={TemplateDesigner} />
        <Route path="/template-documents/:id" component={TemplateDocumentPage} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

export default Router;
