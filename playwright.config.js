import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'**/*.spec.js',workers:1,timeout:30000,use:{baseURL:'http://localhost:8080',headless:true,viewport:{width:1440,height:960}},webServer:{command:'node server.mjs',url:'http://localhost:8080',reuseExistingServer:true}});
