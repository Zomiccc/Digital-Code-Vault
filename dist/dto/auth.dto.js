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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomerLoginDto = exports.CustomerRegisterDto = exports.RefreshTokenDto = exports.MerchantLoginDto = exports.AdminLoginDto = void 0;
const class_validator_1 = require("class-validator");
class AdminLoginDto {
    email;
    password;
}
exports.AdminLoginDto = AdminLoginDto;
__decorate([
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], AdminLoginDto.prototype, "email", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(8),
    __metadata("design:type", String)
], AdminLoginDto.prototype, "password", void 0);
class MerchantLoginDto {
    email;
    password;
}
exports.MerchantLoginDto = MerchantLoginDto;
__decorate([
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], MerchantLoginDto.prototype, "email", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(8),
    __metadata("design:type", String)
], MerchantLoginDto.prototype, "password", void 0);
class RefreshTokenDto {
    refresh_token;
}
exports.RefreshTokenDto = RefreshTokenDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], RefreshTokenDto.prototype, "refresh_token", void 0);
class CustomerRegisterDto {
    name;
    email;
    password;
}
exports.CustomerRegisterDto = CustomerRegisterDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CustomerRegisterDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], CustomerRegisterDto.prototype, "email", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(8),
    __metadata("design:type", String)
], CustomerRegisterDto.prototype, "password", void 0);
class CustomerLoginDto {
    email;
    password;
}
exports.CustomerLoginDto = CustomerLoginDto;
__decorate([
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], CustomerLoginDto.prototype, "email", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(8),
    __metadata("design:type", String)
], CustomerLoginDto.prototype, "password", void 0);
//# sourceMappingURL=auth.dto.js.map