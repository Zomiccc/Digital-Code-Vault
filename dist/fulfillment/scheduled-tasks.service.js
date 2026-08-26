"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ScheduledTasksService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScheduledTasksService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const fulfillment_service_1 = require("../fulfillment/fulfillment.service");
let ScheduledTasksService = ScheduledTasksService_1 = class ScheduledTasksService {
    fulfillmentService;
    logger = new common_1.Logger(ScheduledTasksService_1.name);
    constructor(fulfillmentService) {
        this.fulfillmentService = fulfillmentService;
    }
    async sweepExpiredReservations() {
        try {
            await this.fulfillmentService.sweepExpiredReservations();
        }
        catch (err) {
            this.logger.error(`Failed to sweep expired reservations: ${err.message}`);
        }
    }
};
exports.ScheduledTasksService = ScheduledTasksService;
__decorate([
    (0, schedule_1.Cron)('*/5 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ScheduledTasksService.prototype, "sweepExpiredReservations", null);
exports.ScheduledTasksService = ScheduledTasksService = ScheduledTasksService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [fulfillment_service_1.FulfillmentService])
], ScheduledTasksService);
//# sourceMappingURL=scheduled-tasks.service.js.map