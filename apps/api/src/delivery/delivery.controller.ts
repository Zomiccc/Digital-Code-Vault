import { Controller, Get, Post, Param, Req, Res, Header } from "@nestjs/common";
import { randomBytes } from "crypto";
import { Response } from "express";
import { DeliveryService } from "./delivery.service";
import { deliveryPage } from "./delivery-page";

/** Metadata never includes codes; revealing requires an explicit POST. */
@Controller("d")
export class DeliveryApiController {
  constructor(private deliveryService: DeliveryService) {}
  @Get(":token")
  @Header("Cache-Control", "no-store")
  @Header("Referrer-Policy", "no-referrer")
  async getDeliveryInfo(@Param("token") token: string) {
    return this.deliveryService.getDeliveryInfo(token);
  }
  @Post(":token/reveal")
  @Header("Cache-Control", "no-store")
  @Header("Referrer-Policy", "no-referrer")
  async revealCode(@Param("token") token: string, @Req() req: any) {
    return this.deliveryService.revealCode(token, req.ip);
  }
}

@Controller("reveal")
export class DeliveryController {
  constructor(private deliveryService: DeliveryService) {}
  private prepare(res: Response): string {
    const nonce = randomBytes(18).toString("base64");
    res.set({
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
    });
    res.type("html");
    return nonce;
  }
  @Get(":token")
  async getDeliveryInfo(@Param("token") token: string, @Res() res: Response) {
    const nonce = this.prepare(res);
    try {
      res.send(
        deliveryPage(
          await this.deliveryService.getDeliveryInfo(token),
          token,
          nonce,
        ),
      );
    } catch (err) {
      this.failure(res, token, nonce, err);
    }
  }
  @Post(":token/reveal")
  async revealCode(
    @Param("token") token: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const nonce = this.prepare(res);
    try {
      res.send(
        deliveryPage(
          await this.deliveryService.revealCode(token, req.ip),
          token,
          nonce,
        ),
      );
    } catch (err) {
      this.failure(res, token, nonce, err);
    }
  }
  private failure(res: Response, token: string, nonce: string, err: unknown) {
    const status = (err as { getStatus?: () => number }).getStatus?.() || 500;
    res
      .status(status)
      .send(
        deliveryPage(
          {},
          token,
          nonce,
          status === 404
            ? "This delivery link or its codes could not be found."
            : "We couldn’t retrieve your delivery right now. Please try your original link again.",
        ),
      );
  }
}
