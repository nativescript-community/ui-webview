import { Component, OnInit } from '@angular/core';
import { RouterExtensions } from '@nativescript/angular';

@Component({
    selector: 'ns-basic-example',
    templateUrl: './basic-example.component.html',
    styleUrls: ['./basic-example.component.scss']
})
export class BasicExampleComponent implements OnInit {
    constructor(private router: RouterExtensions) {}

    ngOnInit(): void {}

    goBack(): void {
        this.router.back();
    }
}
