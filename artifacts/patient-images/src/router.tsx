import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { AppLayout } from "@/components/layout";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Patients from "@/pages/patients";
import PatientNew from "@/pages/patient-new";
import PatientDetail from "@/pages/patient-detail";
import PatientEdit from "@/pages/patient-edit";
import Capture from "@/pages/capture";
import Gallery from "@/pages/gallery";
import Editor from "@/pages/editor";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";

function Router() {
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
        <Route path="/editor/:id" component={Editor} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

export default Router;
