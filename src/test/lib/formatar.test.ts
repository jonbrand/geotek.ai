import { formatarGrau, formatarHa, formatarMetros } from "@/lib/formatar";

describe("formatação brasileira", () => {
  it("formata hectares com quatro casas e vírgula", () => {
    expect(formatarHa(512.34)).toBe("512,3400 ha");
    expect(formatarHa(1234.5)).toBe("1.234,5000 ha");
  });

  it("formata metros", () => {
    expect(formatarMetros(1234.5)).toBe("1.234,50 m");
  });

  it("formata coordenadas em graus, minutos e segundos", () => {
    expect(formatarGrau(-15.7939, "lat")).toBe(`15°47'38,04" S`);
    expect(formatarGrau(-47.8828, "lon")).toBe(`47°52'58,08" O`);
  });
});
