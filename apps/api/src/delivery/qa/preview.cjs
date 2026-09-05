// Local-only preview: real controllers and built portal, entirely synthetic service data.
// Run from the repository root: node apps/api/src/delivery/qa/preview.cjs
process.env.TS_NODE_PROJECT = require('path').resolve('apps/api/tsconfig.json');
require('ts-node/register/transpile-only');
require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { Module, NotFoundException } = require('@nestjs/common');
const express = require('express');
const path = require('path');
const { DeliveryController, DeliveryApiController } = require('../delivery.controller');
const { DeliveryService } = require('../delivery.service');
const { deliveryEmail } = require('../../email/delivery-email');
const viewed = new Set();
const fixture = { product_name: 'PlayStation Store Gift Card', reference_id: 'CH-2026-00482', fulfillment_id: 'sample-order', is_revealed: false };
const codes = [{ denomination: '$50', code: 'DEMO-ONLY-7X4P-9K2M' }, { denomination: '$25', code: 'DEMO-ONLY-3N8R-6W5T' }];
const service = {
  async getDeliveryInfo(token) { if (token === 'invalid') throw new NotFoundException(); return { ...fixture, is_revealed: viewed.has(token) }; },
  async revealCode(token) { if (token === 'invalid') throw new NotFoundException(); if (token === 'failure') throw new Error('simulated outage'); viewed.add(token); return { ...fixture, codes }; },
};
class PreviewModule {}
Module({ controllers: [DeliveryController, DeliveryApiController], providers: [{ provide: DeliveryService, useValue: service }] })(PreviewModule);
(async () => {
  const app = await NestFactory.create(PreviewModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  app.use('/d', express.static(path.resolve('apps/portal/dist'), { index: false }));
  app.use('/d', (req,res) => res.sendFile(path.resolve('apps/portal/dist/index.html')));
  app.use('/email-preview', (req,res) => res.type('html').send(deliveryEmail({ customerName: 'Alex', productName: fixture.product_name, reference: fixture.reference_id, amount: 'USD 75.00', link: 'http://localhost:4319/api/v1/reveal/sample' })));
  app.use('/mobile-preview', (req,res) => {
    const routes = { html: '/api/v1/reveal/mobile', portal: '/d/mobile', email: '/email-preview' };
    const route = routes[req.query.view] || routes.html;
    res.type('html').send(`<!doctype html><html><head><title>390px mobile viewport</title></head><body style="margin:0;background:#e4e8e2"><iframe title="Mobile delivery preview at 390px" style="display:block;width:390px;height:100vh;border:0;margin:auto" src="${route}"></iframe></body></html>`);
  });
  await app.listen(4319, '127.0.0.1');
  console.log('Synthetic delivery QA running at http://localhost:4319; no database or email transport connected.');
})();
