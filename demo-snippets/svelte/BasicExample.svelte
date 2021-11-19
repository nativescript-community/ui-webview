<script lang="typescript">
    import { goBack } from 'svelte-native';
</script>

<page>
    <actionBar title="Basic Pager">
        <navigationButton text="Go back" on:tap={() => goBack()} />
    </actionBar>
    <stackLayout class="page" />
</page>

<style>
    .label {
        font-size: 35;
        width: 100%;
        text-align: center;
        vertical-alignment: center;
        color: #ffffff;
        text-transform: uppercase;
    }
</style>
