import { NO_ERRORS_SCHEMA, NgModule } from '@angular/core';

import { WebViewExtModule } from '@nativescript-community/ui-webview/angular';
import { BasicExampleComponent } from './basic-example/basic-example.component';

export const COMPONENTS = [BasicExampleComponent];
@NgModule({
    imports: [WebViewExtModule],
    exports: [WebViewExtModule],
    schemas: [NO_ERRORS_SCHEMA]
})
export class InstallModule {}

export function installPlugin() {}

export const demos = [{ name: 'Static Example', path: 'static-example', component: BasicExampleComponent }];
