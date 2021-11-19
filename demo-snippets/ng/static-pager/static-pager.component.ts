import { Component, OnInit } from '@angular/core';
import { RouterExtensions } from '@nativescript/angular';

@Component({
    selector: 'ns-static-pager',
    templateUrl: './static-pager.component.html',
    styleUrls: ["./static-pager.component.scss"],
})
export class StaticPagerComponent implements OnInit {
    constructor(private router: RouterExtensions) {}

    ngOnInit(): void {}

    goBack(): void {
        this.router.back();
    }
}
