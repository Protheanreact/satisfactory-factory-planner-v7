import { describe, expect, it } from "vitest";
import { analyzeMaterialBalances, planProduction, planProductionVariants, recipeAudit } from "./optimizer";
import type { DataBundle } from "./gameData";

const bundle: DataBundle = {
  meta: { gameVersion: "test", changelist: 1 }, checkedAt: "2026-01-01T00:00:00.000Z", source: "test",
  gameData: {
    items: {
      ore: { id: "ore", name: "Eisenerz", form: "solid", raw: true },
      ingot: { id: "ingot", name: "Eisenbarren", form: "solid", raw: false },
      plate: { id: "plate", name: "Eisenplatte", form: "solid", raw: false },
      altPlate: { id: "altPlate", name: "Beschichtete Platte", form: "solid", raw: false }
    },
    recipes: [
      { id: "smelt", name: "Eisenbarren", kind: "standard", machine: "smelter", duration: 2, power: 4, inputs: [{ item: "ore", rate: 30 }], outputs: [{ item: "ingot", rate: 30 }] },
      { id: "plate", name: "Eisenplatte", kind: "standard", machine: "constructor", duration: 6, power: 4, inputs: [{ item: "ingot", rate: 30 }], outputs: [{ item: "plate", rate: 20 }] },
      { id: "alt-plate", name: "Alternative Platte", kind: "alternate", machine: "constructor", duration: 6, power: 4, inputs: [{ item: "ore", rate: 20 }], outputs: [{ item: "plate", rate: 20 }] }
    ],
    machines: {
      smelter: { id: "smelter", name: "Schmelzofen", power: 4, powerExp: 1.6, variable: false, somersloopSlots: 0, tier: 1 },
      constructor: { id: "constructor", name: "Konstruktor", power: 4, powerExp: 1.6, variable: false, somersloopSlots: 2, tier: 1 }
    },
    worldLimits: {}, belts: [{ id: "belt", name: "Band", rate: 60, tier: 1 }], pipes: [{ id: "pipe", name: "Rohr", rate: 300, tier: 1 }], extractors: []
  }
};
const base = { objective: "balanced" as const, strategy: "efficient" as const, allowAlternates: false, allowOverclock: false, maxClock: 100, useSomersloops: false };

describe("production planner prototype", () => {
  it("expands a standard recipe into raw material demand", () => {
    const result = planProduction(bundle, "plate", 20, base);
    expect(result.raw.find(x => x.item === "ore")?.rate).toBe(30);
    expect(result.lines.some(x => x.recipeId === "smelt")).toBe(true);
  });
  it("does not use alternate recipes when disabled", () => {
    const result = planProduction(bundle, "plate", 20, { ...base, objective: "resources" });
    expect(result.lines.some(x => x.recipeId === "alt-plate")).toBe(false);
  });
  it("allows an alternate recipe when enabled", () => {
    const result = planProduction(bundle, "plate", 20, { ...base, objective: "resources", allowAlternates: true });
    expect(result.lines.some(x => x.recipeId === "alt-plate")).toBe(true);
  });
  it("applies the configured clock and Somersloop output multiplier", () => {
    const clocked = planProduction(bundle, "plate", 40, { ...base, allowOverclock: true, maxClock: 250 });
    expect(clocked.lines.find(x => x.recipeId === "plate")?.clock).toBe(200);
    const looped = planProduction(bundle, "plate", 40, { ...base, useSomersloops: true });
    expect(looped.lines.find(x => x.recipeId === "plate")?.somersloops).toBeGreaterThan(0);
  });
  it("audits the imported recipe structure", () => {
    const audit = recipeAudit(bundle.gameData);
    expect(audit.recipes).toBe(3);
    expect(audit.alternates).toBe(1);
    expect(audit.errors).toBe(0);
  });
});

describe("recursive recipe selection", () => {
  it("compares complete upstream chains instead of only the target recipe", () => {
    const result = planProduction(bundle, "plate", 20, { ...base, objective: "resources", allowAlternates: true });
    expect(result.lines.some(x => x.recipeId === "alt-plate")).toBe(true);
    expect(result.raw.find(x => x.item === "ore")?.rate).toBe(20);
  });

  it("guards against recipe dependency cycles", () => {
    const cyclic = structuredClone(bundle);
    cyclic.gameData.recipes = cyclic.gameData.recipes.filter(r => r.id !== "smelt" && r.id !== "alt-plate");
    cyclic.gameData.recipes.push({ id: "cycle", name: "Kreislauf-Test", kind: "standard", machine: "constructor", duration: 1, power: 1, inputs: [{ item: "plate", rate: 1 }], outputs: [{ item: "ingot", rate: 1 }] });
    const result = planProduction(cyclic, "plate", 20, { ...base, allowAlternates: false });
    expect(result.warnings.some(x => x.includes("Produktionszyklus"))).toBe(true);
  });
});


describe("global material ledger", () => {
  it("reports coproduct surplus instead of silently hiding it", () => {
    const lines = [{
      recipeId: "test", recipeName: "Test", kind: "standard", machineName: "Schmelzofen", machineCount: 1, clock: 100, powerMW: 4, somersloops: 0,
      inputs: [{ item: "ore", name: "Eisenerz", rate: 30, form: "Feststoff" }],
      outputs: [{ item: "plate", name: "Eisenplatte", rate: 20, form: "Feststoff" }, { item: "ingot", name: "Eisenbarren", rate: 10, form: "Feststoff" }]
    }];
    const balances = analyzeMaterialBalances(lines, bundle.gameData, "plate");
    expect(balances.find(x => x.item === "plate")?.status).toBe("target");
    expect(balances.find(x => x.item === "ingot")?.status).toBe("surplus");
    expect(balances.find(x => x.item === "ore")?.status).toBe("raw");
  });

  it("marks an intermediate item deficit when its recipe input is not supplied by a producer", () => {
    const lines = [{
      recipeId: "test", recipeName: "Test", kind: "standard", machineName: "Konstruktor", machineCount: 1, clock: 100, powerMW: 4, somersloops: 0,
      inputs: [{ item: "ingot", name: "Eisenbarren", rate: 30, form: "Feststoff" }],
      outputs: [{ item: "plate", name: "Eisenplatte", rate: 20, form: "Feststoff" }]
    }];
    const balances = analyzeMaterialBalances(lines, bundle.gameData, "plate");
    expect(balances.find(x => x.item === "ingot")?.status).toBe("deficit");
  });
});


describe("liquid and gas recipe chains", () => {
  it("keeps liquid flows in the recursive chain instead of treating them as missing solid recipes", () => {
    const fluids = structuredClone(bundle);
    Object.assign(fluids.gameData.items, {
      crude: { id: "crude", name: "RohÃ¶l", form: "liquid", raw: true },
      residue: { id: "residue", name: "Schwere Ã–lreste", form: "liquid", raw: false },
      fuel: { id: "fuel", name: "Treibstoff", form: "liquid", raw: false },
      turbofuel: { id: "turbofuel", name: "Turbotreibstoff", form: "liquid", raw: true }
    });
    fluids.gameData.recipes.push(
      { id: "oil-residue", name: "Schwere Ã–lreste", kind: "standard", machine: "refinery", duration: 6, power: 30, inputs: [{ item: "crude", rate: 30 }], outputs: [{ item: "residue", rate: 40 }] },
      { id: "residue-fuel", name: "VerdÃ¼nnter Treibstoff", kind: "alternate", machine: "refinery", duration: 6, power: 30, inputs: [{ item: "residue", rate: 20 }], outputs: [{ item: "fuel", rate: 40 }] },
      { id: "fuel-turbo", name: "Turbotreibstoff", kind: "standard", machine: "refinery", duration: 6, power: 30, inputs: [{ item: "fuel", rate: 20 }], outputs: [{ item: "turbofuel", rate: 10 }] }
    );
    fluids.gameData.machines.refinery = { id: "refinery", name: "Raffinerie", power: 30, powerExp: 1.6, variable: false, somersloopSlots: 0, tier: 1 };
    const result = planProduction(fluids, "turbofuel", 10, { ...base, allowAlternates: true });
    expect(result.lines.map(x => x.recipeId)).toEqual(expect.arrayContaining(["oil-residue", "residue-fuel", "fuel-turbo"]));
    expect(result.lines.find(x => x.recipeId === "oil-residue")?.inputs[0]?.form).toBe("Flüssigkeit");
    expect(result.target.form).toBe("Flüssigkeit");
    expect(result.raw.find(x => x.item === "crude")?.rate).toBeGreaterThan(0);
  });

  it("bounds alternate-recipe search on highly branching datasets", () => {
    const branching = structuredClone(bundle);
    const depth = 24;
    for (let i = 0; i < depth; i++) {
      const itemId = `branch-${i}`;
      branching.gameData.items[itemId] = { id: itemId, name: `Verzweigung ${i}`, form: "solid", raw: false };
      for (let variant = 0; variant < 8; variant++) {
        branching.gameData.recipes.push({ id: `branch-recipe-${i}-${variant}`, name: `Alternative ${i}-${variant}`, kind: "alternate", machine: "constructor", duration: 1, power: 4, inputs: [{ item: i === 0 ? "ore" : `branch-${i - 1}`, rate: 1 + variant / 100 }], outputs: [{ item: itemId, rate: 1 }] });
      }
    }
    const started = Date.now();
    const result = planProduction(branching, `branch-${depth - 1}`, 1, { ...base, allowAlternates: true });
    expect(result.lines.length).toBeGreaterThan(0);
    expect(Date.now() - started).toBeLessThan(3000);
    expect(result.warnings.join(" ")).toMatch(/Suchbudget erreicht|Rekursionstiefe.*erreicht/);
  });
});


describe("packaging avoidance and readable production order", () => {
  it("does not use packaging/unpackaging detours for a normal liquid target", () => {
    const fluids = structuredClone(bundle);
    Object.assign(fluids.gameData.items, {
      crude: { id: "crude", name: "Rohöl", form: "liquid", raw: true },
      packagedCrude: { id: "packagedCrude", name: "Packaged Oil", form: "solid", raw: false },
      fuel: { id: "fuel", name: "Treibstoff", form: "liquid", raw: false }
    });
    fluids.gameData.machines.refinery = { id: "refinery", name: "Raffinerie", power: 30, powerExp: 1.6, variable: false, somersloopSlots: 0, tier: 1 };
    fluids.gameData.recipes.push(
      { id: "direct-fuel", name: "Treibstoff aus Rohöl", kind: "standard", machine: "refinery", duration: 6, power: 30, inputs: [{ item: "crude", rate: 30 }], outputs: [{ item: "fuel", rate: 20 }] },
      { id: "pack-oil", name: "Packaged Oil", kind: "standard", machine: "constructor", duration: 4, power: 4, inputs: [{ item: "crude", rate: 30 }], outputs: [{ item: "packagedCrude", rate: 30 }] },
      { id: "unpack-oil", name: "Unpackage Oil", kind: "standard", machine: "refinery", duration: 4, power: 30, inputs: [{ item: "packagedCrude", rate: 30 }], outputs: [{ item: "crude", rate: 30 }] }
    );
    const result = planProduction(fluids, "fuel", 20, base);
    expect(result.lines.some(line => /packag|unpack/i.test(line.recipeName))).toBe(false);
    expect(result.lines.map(line => line.recipeId)).toContain("direct-fuel");
  });

  it("keeps a beneficial water-based alternate recipe available", () => {
    const fluids = structuredClone(bundle);
    Object.assign(fluids.gameData.items, {
      water: { id: "water", name: "Wasser", form: "liquid", raw: true }
    });
    fluids.gameData.recipes.push({ id: "water-alt-plate", name: "Beschichtete Platte mit Wasser", kind: "alternate", machine: "constructor", duration: 6, power: 4, inputs: [{ item: "water", rate: 10 }], outputs: [{ item: "plate", rate: 20 }] });
    const result = planProduction(fluids, "plate", 20, { ...base, objective: "resources", allowAlternates: true });
    expect(result.lines.some(line => line.recipeId === "water-alt-plate")).toBe(true);
  });

  it("orders producers before machines that consume their outputs", () => {
    const result = planProduction(bundle, "plate", 20, base);
    const smelterIndex = result.lines.findIndex(line => line.recipeId === "smelt");
    const constructorIndex = result.lines.findIndex(line => line.recipeId === "plate");
    expect(smelterIndex).toBeGreaterThanOrEqual(0);
    expect(constructorIndex).toBeGreaterThanOrEqual(0);
    expect(smelterIndex).toBeLessThan(constructorIndex);
  });
});

describe("distinct production variants", () => {
  it("returns only distinct recipe graphs and keeps the requested objective", () => {
    const variants = planProductionVariants(bundle, "plate", 20, { ...base, objective: "resources", allowAlternates: true }, 8);
    const signatures = variants.map(v => v.lines.map(line => line.recipeId).sort().join("|"));
    expect(new Set(signatures).size).toBe(signatures.length);
    expect(variants.length).toBeGreaterThan(0);
    expect(variants.every(v => v.objective === "resources")).toBe(true);
  });
});





