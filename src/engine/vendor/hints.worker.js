var Yo = Object.defineProperty;
var Jo = (X, E, L) => E in X ? Yo(X, E, {
    enumerable: !0,
    configurable: !0,
    writable: !0,
    value: L
}) : X[E] = L;
var P = (X, E, L) => Jo(X, typeof E != "symbol" ? E + "" : E, L);
(function() {
    "use strict";
    function X(s) {
        if (s && typeof s == "object" && !Object.isFrozen(s)) {
            Object.freeze(s);
            for (const e of Object.values(s))
                X(e)
        }
        return s
    }
    function E(s, e, t) {
        return {
            type: "value",
            value: s,
            unit: e,
            tone: t
        }
    }
    function L(s, e) {
        return {
            type: "reference",
            key: s,
            tone: e
        }
    }
    function N(s) {
        return {
            type: "operator",
            value: s
        }
    }
    class tt {
        constructor(e=!0) {
            P(this, "groups", new Map);
            P(this, "metrics", new Map);
            this.enabled = e
        }
        addGroup(e, t, o) {
            !this.enabled || this.groups.get(e) || this.groups.set(e, {
                key: e,
                label: t,
                metrics: [],
                metadata: o
            })
        }
        addMetric(e, t) {
            if (!this.enabled)
                return;
            const o = this.groups.get(e);
            if (!o)
                throw new Error(`Breakdown group "${e}" must be added first.`);
            if (this.metrics.has(t.key))
                throw new Error(`Duplicate breakdown metric key "${t.key}".`);
            const n = {
                ...t,
                formula: t.formula ? [...t.formula] : [],
                unavailable: t.unavailable ?? t.value == null
            };
            this.metrics.set(t.key, n),
            o.metrics.push(n)
        }
        getMetric(e) {
            return this.metrics.get(e)
        }
        toGroups() {
            if (!this.enabled)
                return [];
            const e = [...this.groups.values()].map(t => ({
                key: t.key,
                label: t.label,
                metadata: t.metadata ? {
                    ...t.metadata
                } : void 0,
                metrics: t.metrics.map(o => ({
                    ...o,
                    metadata: o.metadata ? {
                        ...o.metadata
                    } : void 0,
                    formula: (o.formula ?? []).map(n => {
                        if (n.type !== "reference")
                            return {
                                ...n
                            };
                        const a = this.metrics.get(n.key);
                        return {
                            ...n,
                            value: (a == null ? void 0 : a.value) ?? void 0,
                            unit: a == null ? void 0 : a.unit,
                            label: a == null ? void 0 : a.label,
                            unavailable: a == null || a.unavailable || a.value == null
                        }
                    }
                    )
                }))
            }));
            return X(e)
        }
    }
    function ee(s, e) {
        return s != null && s.scope ? `${s.scope}.${e}` : e
    }
    const xe = 24
      , ot = 10
      , st = .1
      , _t = {
        petroleum: {
            productionPoints: 1,
            productionNeeds: {}
        },
        grain: {
            productionPoints: 1,
            productionNeeds: {}
        },
        limestone: {
            productionPoints: 1,
            productionNeeds: {}
        },
        coca: {
            productionPoints: 1,
            productionNeeds: {}
        },
        lead: {
            productionPoints: 1,
            productionNeeds: {}
        },
        wood: {
            productionPoints: 1,
            productionNeeds: {}
        },
        fish: {
            productionPoints: 40,
            productionNeeds: {}
        },
        livestock: {
            productionPoints: 20,
            productionNeeds: {}
        },
        iron: {
            productionPoints: 1,
            productionNeeds: {}
        },
        concrete: {
            productionPoints: 10,
            productionNeeds: {
                limestone: 10
            }
        },
        steel: {
            productionPoints: 10,
            productionNeeds: {
                iron: 10
            }
        },
        bread: {
            productionPoints: 10,
            productionNeeds: {
                grain: 10
            }
        },
        steak: {
            productionPoints: 20,
            productionNeeds: {
                livestock: 1
            }
        },
        cookedFish: {
            productionPoints: 40,
            productionNeeds: {
                fish: 1
            }
        },
        lightAmmo: {
            productionPoints: 1,
            productionNeeds: {
                lead: 1
            }
        },
        ammo: {
            productionPoints: 4,
            productionNeeds: {
                lead: 4
            }
        },
        heavyAmmo: {
            productionPoints: 16,
            productionNeeds: {
                lead: 16
            }
        },
        cocain: {
            productionPoints: 200,
            productionNeeds: {
                coca: 200
            }
        },
        oil: {
            productionPoints: 1,
            productionNeeds: {
                petroleum: 1
            }
        },
        paper: {
            productionPoints: 1,
            productionNeeds: {
                wood: 1
            }
        }
    }
      , Tt = {
        common: 6,
        uncommon: 18,
        rare: 54,
        epic: 162,
        legendary: 486,
        mythic: 1458
    }
      , Ue = 100
      , nt = 4;
    function ae(s, e, t) {
        const o = Math.max(e, s);
        return t == null ? o : Math.min(o, t)
    }
    function Ut(s) {
        return 30 + s * 5
    }
    function Vt(s) {
        return 30 + s * 10
    }
    function Gt(s) {
        return 10 + s * 3
    }
    function at(s) {
        return s * st
    }
    function it(s) {
        return s * st
    }
    function rt(s, e={}) {
        return (e.getEnergyRegenerationPerHour ?? at)(s) * xe
    }
    function lt(s, e={}) {
        return (e.getEntrepreneurshipRegenerationPerHour ?? it)(s) * xe
    }
    function B(s, e=0) {
        return Number.isFinite(s) ? s : e
    }
    function zt(s, e={}) {
        const t = Math.max(0, B(s.baseAttack))
          , o = B(s.ammoAttackPercent)
          , n = B(s.attackBonusPercent)
          , a = Math.max(0, B(s.precisionPercent))
          , i = Math.min(Ue, a)
          , l = Math.max(0, a - Ue)
          , r = l * nt
          , c = t + r
          , u = c * (1 + o / 100) * (1 + n / 100)
          , h = ae(B(s.criticalChancePercent), 0, 100)
          , g = B(s.criticalDamagePercent)
          , d = i / 100
          , m = h / 100
          , f = Ue - i
          , C = 1 + m * (g / 100)
          , b = C * 100
          , x = u * (1 - d) * .5
          , R = u * d * C
          , y = {
            attack: u,
            baseAttack: t,
            attackBeforeBonuses: c,
            ammoAttackPercent: o,
            attackBonusPercent: n,
            rawPrecisionPercent: a,
            precisionPercent: i,
            precisionOverflowPercent: l,
            precisionOverflowAttack: r,
            missChancePercent: f,
            criticalChancePercent: h,
            criticalDamagePercent: g,
            preciseHitAverageMultiplierPercent: b,
            expectedMissDamage: x,
            expectedPreciseDamage: R,
            expectedDamagePerAttempt: x + R
        }
          , D = e.collector;
        if (D) {
            const M = ee(e, "damage")
              , S = A => ee(e, A);
            D.addGroup(M, "Damage"),
            D.addMetric(M, {
                key: S("baseAttack"),
                label: "Base attack",
                value: t,
                unit: "damage"
            }),
            D.addMetric(M, {
                key: S("precisionOverflowAttack"),
                label: "Precision overflow",
                value: r,
                unit: "damage",
                formula: [E(l, "percent"), N("x"), E(nt, "damage")]
            }),
            D.addMetric(M, {
                key: S("attack"),
                label: "Attack after bonuses",
                value: u,
                unit: "damage",
                formula: [L(S("baseAttack")), N("+"), L(S("precisionOverflowAttack")), N("x"), E(1 + o / 100, "multiplier"), N("x"), E(1 + n / 100, "multiplier")]
            }),
            D.addMetric(M, {
                key: S("expectedMissDamage"),
                label: "Expected miss damage",
                value: x,
                unit: "damage",
                formula: [L(S("attack")), N("x"), E(1 - d, "chance"), N("x"), E(.5, "multiplier")]
            }),
            D.addMetric(M, {
                key: S("expectedPreciseDamage"),
                label: "Expected precise damage",
                value: R,
                unit: "damage",
                formula: [L(S("attack")), N("x"), E(d, "chance"), N("x"), E(C, "multiplier")]
            }),
            D.addMetric(M, {
                key: S("damagePerHit"),
                label: "Damage per hit",
                value: y.expectedDamagePerAttempt,
                unit: "damage",
                tone: "total",
                formula: [L(S("expectedMissDamage")), N("+"), L(S("expectedPreciseDamage"))]
            })
        }
        return y
    }
    function ct(s, e, t={}) {
        var n, a;
        if (s === "none")
            return 0;
        const o = (a = (n = t[s]) == null ? void 0 : n.flatStats) == null ? void 0 : a.healthRegenPercent;
        return typeof o == "number" && Number.isFinite(o) ? Math.max(0, e * (o / 100)) : null
    }
    function ut(s) {
        return Math.round(ae(B(s), 0, 100))
    }
    function de(s) {
        return Math.round(ae(B(s), 0, 100))
    }
    function Ve(s, e) {
        const t = Math.max(0, B(s));
        if (t <= 0)
            return 0;
        const o = ut(e)
          , n = t * (1 - o / 100);
        return Math.max(1, Math.floor(n * 10) / 10)
    }
    function Kt(s, e={}, t={}) {
        const o = e.clamp ?? ae
          , n = Math.max(0, B(s.healthHourlyRegen))
          , a = Math.max(0, B(s.hungerHourlyRegen))
          , i = Math.max(0, B(s.battleHealthCost))
          , l = o(B(s.armorPercent), 0, 100)
          , r = de(o(B(s.dodgePercent), 0, 100))
          , c = o(B(s.precisionPercent ?? 100), 0, 100)
          , u = Math.max(0, B(s.lootChancePercent ?? 0))
          , h = Math.max(0, B(s.foodHealth))
          , g = s.resourceUsageMode === "discrete"
          , d = s.foodCount == null ? a * xe : Math.max(0, B(s.foodCount))
          , m = g ? Math.floor(d) : d
          , C = (s.healthBudget == null ? n * xe : Math.max(0, B(s.healthBudget))) + h * m;
        if (i <= 0) {
            const te = {
                battleHealthCost: i,
                healthLossPerNonDodgedHit: 0,
                expectedHealthLossPerAttempt: 0,
                nonDodgedHitsAffordable: 0,
                dailyHealthBudget: C,
                usableFoodCount: m,
                attemptedHitsPerDay: 0,
                expectedDodgesPerDay: 0,
                expectedNonDodgedHitsPerDay: 0,
                expectedLootEligibleHitsPerDay: 0,
                bulletsPerDay: 0,
                lootChancePercent: u,
                expectedCasesPerDay: 0,
                expectedEliteCasesPerDay: 0,
                expectedMythicCasesPerDay: 0
            };
            return dt(te, s, t, !0),
            te
        }
        const b = Ve(i, l)
          , x = Math.max(1e-6, 1 - r / 100)
          , R = b * x
          , y = b > 0 ? C / b : 0
          , D = g ? Math.floor(y) : y
          , M = D / x
          , S = M * (r / 100)
          , A = M * x
          , w = M * (c / 100)
          , H = w * (u / 100)
          , I = w * (u / 1e4)
          , K = {
            battleHealthCost: i,
            healthLossPerNonDodgedHit: b,
            expectedHealthLossPerAttempt: R,
            nonDodgedHitsAffordable: D,
            dailyHealthBudget: C,
            usableFoodCount: m,
            attemptedHitsPerDay: M,
            expectedDodgesPerDay: S,
            expectedNonDodgedHitsPerDay: A,
            expectedLootEligibleHitsPerDay: w,
            bulletsPerDay: s.hasAmmo ? M : 0,
            lootChancePercent: u,
            expectedCasesPerDay: H,
            expectedEliteCasesPerDay: I,
            expectedMythicCasesPerDay: I
        };
        return dt(K, s, t),
        K
    }
    function dt(s, e, t, o=!1) {
        const n = t.collector;
        if (!n)
            return;
        const a = c => ee(t, c)
          , i = ee(t, "inputs")
          , l = ee(t, "hits")
          , r = ee(t, "loot");
        n.addGroup(i, "Inputs"),
        n.addGroup(l, "Hits"),
        n.addGroup(r, "Loot"),
        n.addMetric(i, {
            key: a("dailyHealthBudget"),
            label: "Health budget",
            value: s.dailyHealthBudget,
            unit: "health",
            tone: "health",
            formula: [E(e.healthHourlyRegen, "health/hour", "health"), N("x"), E(24, "hours"), N("+"), E(e.foodHealth, "health", "health"), N("x"), E(s.usableFoodCount, "food")]
        }),
        n.addMetric(l, {
            key: a("healthPerHit"),
            label: "Health per non-dodged hit",
            value: s.healthLossPerNonDodgedHit,
            unit: "health",
            tone: "health",
            unavailable: o,
            formula: [E(s.battleHealthCost, "health", "health"), N("x"), E(1 - ut(e.armorPercent) / 100, "multiplier")]
        }),
        n.addMetric(l, {
            key: a("expectedHealthLossPerAttempt"),
            label: "Expected health loss per attempt",
            value: s.expectedHealthLossPerAttempt,
            unit: "health",
            tone: "health",
            unavailable: o,
            formula: [L(a("healthPerHit"), "health"), N("x"), E(1 - de(e.dodgePercent) / 100, "chance")]
        }),
        n.addMetric(l, {
            key: a("affordableNonDodgedHits"),
            label: e.resourceUsageMode === "discrete" ? "Usable non-dodged hits" : "Affordable non-dodged hits",
            value: s.nonDodgedHitsAffordable,
            unit: "hits",
            tone: "total",
            unavailable: o,
            formula: [...e.resourceUsageMode === "discrete" ? [N("floor(")] : [], L(a("dailyHealthBudget"), "health"), N("/"), L(a("healthPerHit"), "health"), ...e.resourceUsageMode === "discrete" ? [N(")")] : []]
        }),
        n.addMetric(l, {
            key: a("hitsPerDay"),
            label: e.resourceUsageMode === "discrete" ? "Expected hits" : "Hits per day",
            value: s.attemptedHitsPerDay,
            unit: "hits",
            tone: "total",
            unavailable: o,
            formula: [L(a("affordableNonDodgedHits")), N("/"), E(1 - de(e.dodgePercent) / 100, "chance")]
        }),
        n.addMetric(l, {
            key: a("wearHitsPerDay"),
            label: "Equipment wear hits",
            value: s.expectedNonDodgedHitsPerDay,
            unit: "hits",
            unavailable: o,
            formula: [L(a("hitsPerDay")), N("x"), E(1 - de(e.dodgePercent) / 100, "chance")]
        }),
        n.addMetric(r, {
            key: a("expectedCasesPerDay"),
            label: "Expected cases",
            value: s.expectedCasesPerDay,
            unit: "cases",
            unavailable: o,
            formula: [L(a("hitsPerDay")), N("x"), E((e.precisionPercent ?? 100) / 100, "chance"), N("x"), E((e.lootChancePercent ?? 0) / 100, "chance")]
        }),
        n.addMetric(r, {
            key: a("expectedMythicCasesPerDay"),
            label: "Expected mythic cases",
            value: s.expectedMythicCasesPerDay,
            unit: "cases",
            unavailable: o
        })
    }
    function Ge(s, e, t={}) {
        if (!s)
            return null;
        const o = Tt[s];
        if (typeof o != "number")
            return null;
        const a = (t.clamp ?? ae)(B(e), 0, 1);
        return Math.floor(o / 3 + o * 2 / 3 * a)
    }
    function $t(s, e, t, o=null, n=null, a={}) {
        if (!s || typeof s.maxState != "number" || s.maxState <= 0 || e <= 0)
            return {
                stateLossPerDay: null,
                itemLifespanDays: null,
                grossDailyCost: null,
                scrapCredit: null,
                brokenScraps: null,
                scrapUnavailableReason: null,
                dailyCost: null
            };
        const i = a.getScrapYieldForState ?? Ge
          , l = typeof t == "number" ? e * t / s.maxState : null
          , r = i(n, 0)
          , c = r != null && typeof o == "number" ? e * r * o / s.maxState : null
          , u = r == null ? "rarity unavailable" : typeof o != "number" ? "scraps price unavailable" : null;
        return {
            stateLossPerDay: e,
            itemLifespanDays: s.maxState / e,
            grossDailyCost: l,
            scrapCredit: c,
            brokenScraps: r,
            scrapUnavailableReason: u,
            dailyCost: l == null ? null : Math.max(0, l - (c ?? 0))
        }
    }
    function Wt(s) {
        return xe * s
    }
    function Yt(s) {
        return s + 2
    }
    function Jt(s, e={}) {
        const t = e.getProductionPointsPerAction ?? Gt
          , o = e.getEnergyCapacity ?? Vt
          , n = e.getEntrepreneurshipCapacity ?? Ut;
        return {
            ppVal: t(s.lProd),
            maxEnergy: o(s.lEng),
            maxEntrepreneurship: n(s.lEnt)
        }
    }
    function Zt(s, e, t={}) {
        return (t.getEnergyRegenerationPerDay ?? rt)(s) / ot * e
    }
    function ht(s, e, t={}) {
        return (t.getEntrepreneurshipRegenerationPerDay ?? lt)(s) / ot * e
    }
    function Qt(s, e, t, o=0, n={}) {
        const a = n.getEnergyProductionPoints ?? Zt
          , i = n.getEntrepreneurshipProductionPoints ?? ht
          , l = a(s, t)
          , r = i(e, t);
        return {
            jobPp: l,
            companyPp: r,
            automatedEnginePp: o,
            totalPp: l + r + o
        }
    }
    function Xt(s, e, t, o=0, n=0, a=[], i={}) {
        const l = i.calculateDailyProductionTotals ?? Qt
          , r = i.getEnergyRegenerationPerHour ?? at
          , c = i.getEntrepreneurshipRegenerationPerHour ?? it
          , u = i.getEnergyRegenerationPerDay ?? rt
          , h = i.getEntrepreneurshipRegenerationPerDay ?? lt
          , g = l(s.maxEnergy, s.maxEntrepreneurship, s.ppVal, o)
          , d = r(s.maxEnergy)
          , m = c(s.maxEntrepreneurship)
          , f = u(s.maxEnergy)
          , C = h(s.maxEntrepreneurship)
          , b = g.jobPp * e
          , x = g.companyPp * t;
        return {
            energy: s.maxEnergy,
            entrepreneurship: s.maxEntrepreneurship,
            ppVal: s.ppVal,
            energyRegenPerHour: d,
            entrepreneurshipRegenPerHour: m,
            energyRegenPerDay: f,
            entrepreneurshipRegenPerDay: C,
            jobPp: g.jobPp,
            companyPp: g.companyPp,
            automatedEnginePp: g.automatedEnginePp,
            jobSalary: e,
            companyCoinRate: t,
            automatedEngineContributions: a,
            totalPp: g.totalPp,
            jobCoins: b,
            companyCoins: x,
            automatedEngineCoins: n,
            totalCoins: b + x + n
        }
    }
    function eo(s, e, t, o=0, n=0, a=[], i={}) {
        const r = (i.calculateProductionBreakdown ?? Xt)(s, e, t, o, n, a);
        return {
            pp: Math.round(r.totalPp),
            coins: r.totalCoins.toFixed(2),
            breakdown: r
        }
    }
    function to(s) {
        const e = s.filter(t => typeof t == "number");
        return e.length ? {
            best: Math.max(...e),
            worst: Math.min(...e),
            average: e.reduce( (t, o) => t + o, 0) / e.length
        } : {
            best: .08,
            worst: .08,
            average: .08
        }
    }
    function oo(s, e, t, o={}) {
        var d;
        const n = o.itemProductionConfig ?? _t
          , a = s ? (d = o.gameConfigItems) == null ? void 0 : d[s] : void 0
          , i = s ? n[s] : void 0
          , l = typeof (a == null ? void 0 : a.productionPoints) == "number" ? {
            productionPoints: a.productionPoints,
            productionNeeds: a.productionNeeds ?? {}
        } : i
          , r = s ? e == null ? void 0 : e[s] : void 0
          , c = (t == null ? void 0 : t.total) ?? 0;
        if (!l || typeof l.productionPoints != "number" || l.productionPoints <= 0 || typeof r != "number" || typeof c != "number")
            return null;
        let u = 0;
        for (const [m,f] of Object.entries(l.productionNeeds || {})) {
            const C = e == null ? void 0 : e[m];
            if (typeof C != "number" || typeof f != "number")
                return null;
            u += C * f
        }
        const h = 1 + c / 100;
        return (r - u) * h / l.productionPoints
    }
    function so(s) {
        const e = s.collector ?? new tt
          , t = {
            collector: e,
            scope: s.scope
        }
          , o = Kt(s.combat, {}, t)
          , n = zt(s.damage, t)
          , a = Number.isFinite(s.battleBonusPercent) ? Math.max(-100, s.battleBonusPercent ?? 0) : 0
          , i = 1 + a / 100
          , l = Number.isFinite(s.damageMultiplier) ? Math.max(0, s.damageMultiplier ?? 1) : 1
          , r = o.attemptedHitsPerDay * n.expectedDamagePerAttempt * l * i
          , c = ee(t, "combatOutput")
          , u = h => ee(t, h);
        return e.addGroup(c, "Combat Output"),
        e.addMetric(c, {
            key: u("battleBonus"),
            label: "Battle bonus",
            value: a,
            unit: "percent",
            tone: "total"
        }),
        e.addMetric(c, {
            key: u("damageMultiplier"),
            label: "Phase damage multiplier",
            value: l,
            unit: "multiplier"
        }),
        e.addMetric(c, {
            key: u("damagePerDay"),
            label: "Damage per day",
            value: r,
            unit: "damage",
            tone: "total",
            formula: [L(u("hitsPerDay")), N("x"), L(u("damagePerHit")), N("x"), L(u("damageMultiplier")), N("x"), E(i, "multiplier")]
        }),
        {
            combat: o,
            damage: n,
            costs: {},
            loot: {
                expectedCasesPerDay: o.expectedCasesPerDay,
                expectedMythicCasesPerDay: o.expectedMythicCasesPerDay
            },
            battleBonus: {
                percent: a,
                multiplier: i
            },
            finalDamage: r,
            breakdowns: e.toGroups()
        }
    }
    const mt = 1
      , no = 4;
    function ao(s) {
        const e = typeof s == "number" ? s : Number.parseInt(String(s), 10);
        return Number.isFinite(e) ? Math.round(e) : 0
    }
    function io(s) {
        return Math.min(no, Math.max(0, ao(s)))
    }
    function gt(s, e=0, t=mt) {
        return s + io(e) * t
    }
    function Oe(s, e) {
        var o;
        const t = (o = s[String(e)]) == null ? void 0 : o.value;
        return typeof t == "number" && Number.isFinite(t) ? t : null
    }
    function ro(s, e) {
        if (!s || typeof s != "object")
            return null;
        const t = s
          , o = Oe(t, e);
        if (o != null)
            return o;
        const n = Math.max(-1, ...Object.keys(t).map(Number).filter(l => Number.isInteger(l) && Oe(t, l) != null));
        if (n < 0 || e <= n)
            return null;
        const a = Oe(t, n)
          , i = a - (Oe(t, n - 1) ?? a);
        return a + (e - n) * i
    }
    function lo(s, e, t=0, o=mt) {
        const n = s == null ? void 0 : s.levels;
        return ro(n, gt(e, t, o))
    }
    function Ie(s, e=0) {
        return typeof s == "number" && Number.isFinite(s) ? s : e
    }
    function ve(s, e) {
        var o;
        const t = (o = s.skills) == null ? void 0 : o[e];
        return gt(Math.max(0, Math.min(10, Math.round(Ie(t == null ? void 0 : t.level)))), Ie(t == null ? void 0 : t.prestige))
    }
    function co(s) {
        return [...new Set(s)]
    }
    function pt(s) {
        const e = {
            lProd: ve(s.player, "production"),
            lEng: ve(s.player, "energy"),
            lEnt: ve(s.player, "entrepreneurship"),
            lComp: ve(s.player, "companies"),
            lMan: ve(s.player, "management")
        }
          , t = Jt(e)
          , o = Yt(e.lComp)
          , n = ht(t.maxEntrepreneurship, t.ppVal)
          , i = (s.companies ?? []).map( (y, D) => {
            var H, I;
            const M = Math.max(0, Math.floor(Ie((H = y.company.activeUpgradeLevels) == null ? void 0 : H.automatedEngine)))
              , S = Wt(M)
              , A = oo(y.company.itemCode, s.itemPrices, y.productionBonus ?? null, {
                gameConfigItems: s.gameConfigItems
            })
              , w = n + S;
            return {
                index: D,
                disabled: y.company.disabled === !0,
                value: A == null ? 0 : w * A,
                projection: {
                    id: y.company._id ?? null,
                    itemCode: y.company.itemCode ?? null,
                    productionBonusPercent: Ie((I = y.productionBonus) == null ? void 0 : I.total),
                    automatedEngineLevel: M,
                    productionPointsPerDay: n,
                    automatedEngineProductionPointsPerDay: S,
                    profitPerProductionPoint: A,
                    coinsPerDay: A == null ? null : w * A,
                    selected: !1
                }
            }
        }
        )
          , l = Math.max(0, i.length - o)
          , r = new Set([...i].sort( (y, D) => y.disabled !== D.disabled ? y.disabled ? -1 : 1 : y.value !== D.value ? y.value - D.value : y.index - D.index).slice(0, l).map(y => y.index))
          , c = i.filter(y => !r.has(y.index)).sort( (y, D) => D.value - y.value || y.index - D.index).slice(0, o)
          , u = new Set(c.map(y => y.index))
          , h = c.map(y => y.projection.profitPerProductionPoint)
          , g = to(h)
          , d = c.flatMap(y => {
            const D = y.projection;
            return D.profitPerProductionPoint == null ? [] : [{
                pp: D.automatedEngineProductionPointsPerDay,
                coinRate: D.profitPerProductionPoint,
                coins: D.automatedEngineProductionPointsPerDay * D.profitPerProductionPoint
            }]
        }
        )
          , m = d.reduce( (y, D) => y + D.pp, 0)
          , f = d.reduce( (y, D) => y + D.coins, 0)
          , C = typeof s.netJobSalary == "number" && Number.isFinite(s.netJobSalary) ? Math.max(0, s.netJobSalary) : null
          , b = eo(t, C ?? 0, g.average, m, f, d)
          , x = [...s.unavailableReasons ?? []];
        C == null && x.push("job-salary-unavailable"),
        s.companies == null && x.push("owned-companies-unavailable"),
        c.some(y => y.projection.profitPerProductionPoint == null) && x.push("company-production-value-unavailable");
        const R = co(x);
        return {
            player: {
                id: s.player._id ?? null,
                username: s.player.username ?? null
            },
            skillLevels: e,
            companyLimit: o,
            netJobSalary: C,
            companies: i.map(y => ({
                ...y.projection,
                selected: u.has(y.index)
            })),
            breakdown: b.breakdown,
            incomeCoinsPerDay: b.breakdown.totalCoins,
            complete: R.length === 0,
            unavailableReasons: R
        }
    }
    const ze = ["weapon", "ammo", "helmet", "chest", "pants", "boots", "gloves"]
      , qe = new Set(["gun", "rifle", "sniper", "tank", "jet"])
      , uo = 100
      , ft = "cocain"
      , yt = 1.6
      , Pt = .4
      , Ct = 18 / 24
      , bt = 6 / 24
      , ho = {
        weapon: "knife",
        helmet: "helmet2",
        chest: "chest2",
        pants: "pants2",
        boots: "boots2",
        gloves: "gloves2"
    }
      , mo = {
        lightAmmo: {
            percentAttack: 10
        },
        ammo: {
            percentAttack: 20
        },
        heavyAmmo: {
            percentAttack: 40
        }
    };
    function _(s, e=0) {
        return typeof s == "number" && Number.isFinite(s) ? s : e
    }
    function go(s) {
        const e = {
            ammo: null
        };
        for (const [t,o] of Object.entries(ho)) {
            const n = t
              , a = s[o]
              , i = Object.fromEntries(Object.entries((a == null ? void 0 : a.dynamicStats) ?? {}).filter(l => Array.isArray(l[1]) && typeof l[1][1] == "number" && Number.isFinite(l[1][1])).map( ([l,r]) => [l, r[1]]));
            e[n] = {
                code: o,
                type: a == null ? void 0 : a.type,
                ...Object.keys(i).length ? {
                    skills: i
                } : {},
                state: 100,
                maxState: 100
            }
        }
        return e
    }
    function O(s) {
        return typeof s == "number" && Number.isFinite(s) ? s : null
    }
    function po(s) {
        var t;
        const e = s;
        return (t = e.result) != null && t.data ? e.result.data : s
    }
    function Dt(s) {
        var t;
        const e = s;
        if ((t = e.result) != null && t.data) {
            const o = e.result.data;
            return {
                items: (o == null ? void 0 : o.items) ?? {},
                skills: (o == null ? void 0 : o.skills) ?? {},
                battle: (o == null ? void 0 : o.battle) ?? {}
            }
        }
        return s
    }
    function he(s) {
        return typeof s == "string" ? s : (s == null ? void 0 : s.code) ?? ""
    }
    function Se(s, e) {
        var o;
        if (s && typeof s == "object" && s.skills && Object.keys(s.skills).length > 0)
            return s.skills;
        const t = he(s);
        return ((o = e[t]) == null ? void 0 : o.flatStats) ?? mo[t] ?? {}
    }
    function Me(s, e) {
        const t = Object.entries(e).filter(o => Number.isFinite(o[1])).sort( ([o], [n]) => o.localeCompare(n));
        return t.length ? `${s}:${t.map( ([o,n]) => `${o}=${n}`).join("|")}` : `${s}:no-skills`
    }
    function kt(s, e) {
        return s === "weapon" ? e.usage === "weapon" : s === "ammo" ? e.usage === "ammo" : e.usage === s || e.skinSlot === s
    }
    function Ke(s, e) {
        var a;
        const t = he(s.ammo ?? null)
          , o = he(s.weapon ?? null)
          , n = (a = e[o]) == null ? void 0 : a.type;
        return !!(t && o && (qe.has(o) || typeof n == "string" && qe.has(n)))
    }
    function fo(s, e) {
        const t = s.dynamicStats;
        if (!t)
            return !1;
        const o = Object.entries(t);
        return o.length > 0 && o.every( ([n,a]) => {
            const i = e[n];
            return typeof i == "number" && Number.isFinite(i) && i >= a[0] && i <= a[1]
        }
        ) && Object.keys(e).every(n => n in t)
    }
    function yo(s, e) {
        var a;
        const t = he(s.weapon ?? null)
          , o = (a = e[t]) == null ? void 0 : a.type;
        return !!t && (qe.has(t) || typeof o == "string" && qe.has(o)) && !he(s.ammo ?? null)
    }
    function me(s, e, t) {
        const o = typeof t == "string" ? [t] : t;
        return ze.reduce( (n, a) => {
            if (a === "ammo")
                return n;
            const i = Se(s[a] ?? null, e)
              , l = o.map(r => O(i[r])).find(r => r != null) ?? 0;
            return n + l
        }
        , 0)
    }
    function Po(s, e, t) {
        var n;
        const o = (n = s.skills) == null ? void 0 : n[e];
        return typeof (o == null ? void 0 : o.level) != "number" ? null : lo(t[e], o.level, O(o.prestige) ?? 0)
    }
    function G(s, e, t={}) {
        var i;
        const o = (i = s.skills) == null ? void 0 : i[e]
          , n = O(o == null ? void 0 : o.value);
        if (n != null)
            return n;
        const a = Po(s, e, t);
        if (a != null)
            return a;
        if (e === "armor" || e === "dodge") {
            const l = O(o == null ? void 0 : o.total);
            if (l != null)
                return Math.max(0, l - _(o == null ? void 0 : o.equipment) - _(o == null ? void 0 : o.weapon))
        }
        return O(o == null ? void 0 : o.totalAfterSoftCap) ?? O(o == null ? void 0 : o.total) ?? 0
    }
    function Ee(s, e) {
        return typeof e == "number" && Number.isFinite(e) && e > 0 ? s / (s + e) * 100 : s
    }
    function Co(s) {
        if (Array.isArray(s))
            return s;
        const e = s == null ? void 0 : s.items;
        return Array.isArray(e) ? e : []
    }
    function bo(s, e, t, o, n) {
        if (t === "ammo")
            return O(o[s]);
        const a = Me(s, e);
        if (n && !Array.isArray(n) && !("items" in n))
            return O(n[a]);
        const i = Co(n).find(l => Me(l.code, l.skills) === a);
        return O(i == null ? void 0 : i.averagePrice)
    }
    function xt(s, e) {
        if (s && typeof s == "object") {
            const o = O(s.maxState);
            if (o != null && o > 0)
                return o
        }
        const t = O(e == null ? void 0 : e.maxState);
        return t != null && t > 0 ? t : e ? uo : null
    }
    function vt(s, e) {
        var o;
        if (typeof (e == null ? void 0 : e.rarity) == "string")
            return e.rarity;
        const t = Number.parseInt(((o = s.match(/^[A-Za-z]+(\d+)$/)) == null ? void 0 : o[1]) ?? "", 10);
        return ["", "common", "uncommon", "rare", "epic", "legendary", "mythic"][t] ?? null
    }
    function St(s) {
        return [...new Set(s)]
    }
    function Mt(s, e) {
        return s == null || !Number.isFinite(e) || e <= 0 ? null : -s / e * 1e3
    }
    function $e(s) {
        var Fe, He, p, k, v, F, q, J, Z;
        const e = po(s.player)
          , t = Dt(s.gameConfig)
          , o = t.skills ?? {}
          , n = s.itemPrices ?? {}
          , a = s.modifiers ?? {}
          , i = s.equipment
          , l = G(e, "health", o)
          , r = G(e, "hunger", o)
          , c = Math.max(0, _(a.resourceHours, 24))
          , u = O((He = (Fe = e.skills) == null ? void 0 : Fe.health) == null ? void 0 : He.hourlyBarRegen) ?? l / 10
          , h = O((k = (p = e.skills) == null ? void 0 : p.hunger) == null ? void 0 : k.hourlyBarRegen) ?? r / 10
          , g = G(e, "armor", o) + me(i, t.items, "armor")
          , d = G(e, "dodge", o) + me(i, t.items, "dodge")
          , m = G(e, "precision", o) + me(i, t.items, "precision")
          , f = G(e, "criticalChance", o) + me(i, t.items, "criticalChance")
          , C = G(e, "criticalDamages", o) + me(i, t.items, ["criticalDamages", "criticalDamage"])
          , b = me(i, t.items, "attack")
          , x = i.ammo ?? null
          , R = Se(x, t.items)
          , y = Ke(i, t.items) ? _(R.percentAttack ?? R.attackPercent) : 0
          , D = O((v = t.battle) == null ? void 0 : v.healthCost)
          , M = ct(s.foodCode, l, t.items)
          , S = [];
        (D == null || D <= 0) && S.push("battle-health-cost-unavailable"),
        M == null && S.push("food-config-unavailable");
        const A = new tt(s.collectBreakdowns !== !1)
          , w = so({
            combat: {
                battleHealthCost: D ?? 0,
                healthHourlyRegen: u * (c / 24),
                hungerHourlyRegen: h * (c / 24),
                ...a.healthBudget == null ? {} : {
                    healthBudget: Math.max(0, _(a.healthBudget))
                },
                ...a.foodCount == null ? {} : {
                    foodCount: Math.max(0, _(a.foodCount))
                },
                resourceUsageMode: a.resourceUsageMode,
                armorPercent: Ee(g, (F = o.armor) == null ? void 0 : F.softCap),
                dodgePercent: de(Ee(d, (q = o.dodge) == null ? void 0 : q.softCap)),
                precisionPercent: m,
                lootChancePercent: G(e, "lootChance", o),
                foodHealth: M ?? 0,
                hasAmmo: Ke(i, t.items)
            },
            damage: {
                baseAttack: G(e, "attack", o) + b,
                ammoAttackPercent: y,
                attackBonusPercent: _((Z = (J = e.skills) == null ? void 0 : J.attack) == null ? void 0 : Z.militaryRankPercent),
                precisionPercent: m,
                criticalChancePercent: f,
                criticalDamagePercent: C
            },
            battleBonusPercent: a.battleBonusPercent,
            damageMultiplier: a.damageMultiplier,
            scope: s.scope,
            collector: A
        })
          , H = {};
        let I = 0
          , K = 0
          , te = !0;
        for (const Q of ze) {
            const Ce = i[Q] ?? null
              , Le = he(Ce);
            if (!Le)
                continue;
            const Be = t.items[Le]
              , Wo = Se(Ce, t.items)
              , be = bo(Le, Wo, Be == null ? void 0 : Be.usage, n, s.equipmentPrices)
              , qt = Q === "weapon" || Q === "ammo" ? w.combat.attemptedHitsPerDay : w.combat.expectedNonDodgedHitsPerDay;
            let De = null, ke;
            if (Q === "ammo") {
                const ne = Ke(i, t.items)
                  , jt = ne && be != null ? be * w.combat.bulletsPerDay : ne ? null : 0;
                ke = {
                    stateLossPerDay: ne ? w.combat.bulletsPerDay : 0,
                    itemLifespanDays: null,
                    grossDailyCost: jt,
                    scrapCredit: null,
                    brokenScraps: null,
                    scrapUnavailableReason: null,
                    dailyCost: jt
                },
                ne && be == null && (De = "item-price-unavailable")
            } else {
                const ne = xt(Ce, Be);
                ne == null ? De = "item-max-state-unavailable" : be == null && (De = "equipment-price-unavailable"),
                ke = $t(ne == null ? null : {
                    maxState: ne
                }, qt, be, O(n.scraps), vt(Le, Be))
            }
            De && S.push(De),
            ke.grossDailyCost == null && qt > 0 && (te = !1),
            I += ke.grossDailyCost ?? 0,
            K += ke.scrapCredit ?? 0,
            H[Q] = {
                slot: Q,
                code: Le,
                marketPrice: be,
                unavailableReason: De,
                ...ke
            }
        }
        const ce = M == null ? null : s.foodCode === "none" ? 0 : w.combat.usableFoodCount
          , oe = s.foodCode === "none" ? 0 : O(n[s.foodCode])
          , W = ce == null || oe == null ? null : ce * oe;
        s.foodCode !== "none" && oe == null && S.push("item-price-unavailable");
        const $ = O(n.case1)
          , ye = O(n.case2)
          , we = $ == null ? null : w.combat.expectedCasesPerDay * $
          , Re = ye == null ? null : w.combat.expectedMythicCasesPerDay * ye
          , Ne = $ == null && ye == null ? null : (we ?? 0) + (Re ?? 0)
          , ue = te && W != null ? I + W : null
          , Y = s.income ? pt(s.income) : void 0
          , Ae = (Y == null ? void 0 : Y.incomeCoinsPerDay) ?? 0
          , se = ue == null ? null : K + (Ne ?? 0) + Ae - ue;
        A.addGroup("costs", "Costs"),
        A.addMetric("costs", {
            key: "costs.gross",
            label: "Gross daily cost",
            value: ue,
            unit: "coins",
            formula: [E(I, "coins", "coin"), N("+"), E(W ?? 0, "coins", "coin")],
            tone: "coin"
        }),
        A.addMetric("costs", {
            key: "costs.net",
            label: "Net daily cost",
            value: se,
            unit: "coins",
            tone: se != null && se < 0 ? "profit" : "coin"
        });
        const Pe = w.finalDamage;
        return {
            player: {
                id: e._id ?? null,
                username: e.username ?? null
            },
            combat: w.combat,
            damage: w.damage,
            finalDamage: Pe,
            damagePerDay: Pe,
            costPerThousandDamage: Mt(se, Pe),
            battleBonus: w.battleBonus,
            costs: {
                equipment: H,
                equipmentCost: te ? I : null,
                foodCount: ce,
                foodPrice: oe,
                foodCost: W,
                scrapCredit: K,
                caseLootValue: we,
                mythicCaseLootValue: Re,
                lootCredit: Ne,
                ...Y ? {
                    incomeCredit: Ae
                } : {},
                grossCost: ue,
                netCost: se,
                unavailableReasons: St(S)
            },
            loot: w.loot,
            ...Y ? {
                income: Y
            } : {},
            breakdowns: A.toGroups()
        }
    }
    function U(s) {
        return s.some(e => e == null) ? null : s.reduce( (e, t) => e + (t ?? 0), 0)
    }
    function Do(s, e) {
        return {
            battleHealthCost: s.battleHealthCost,
            healthLossPerNonDodgedHit: s.healthLossPerNonDodgedHit,
            expectedHealthLossPerAttempt: s.expectedHealthLossPerAttempt,
            nonDodgedHitsAffordable: s.nonDodgedHitsAffordable + e.nonDodgedHitsAffordable,
            dailyHealthBudget: s.dailyHealthBudget + e.dailyHealthBudget,
            usableFoodCount: s.usableFoodCount + e.usableFoodCount,
            attemptedHitsPerDay: s.attemptedHitsPerDay + e.attemptedHitsPerDay,
            expectedDodgesPerDay: s.expectedDodgesPerDay + e.expectedDodgesPerDay,
            expectedNonDodgedHitsPerDay: s.expectedNonDodgedHitsPerDay + e.expectedNonDodgedHitsPerDay,
            expectedLootEligibleHitsPerDay: s.expectedLootEligibleHitsPerDay + e.expectedLootEligibleHitsPerDay,
            bulletsPerDay: s.bulletsPerDay + e.bulletsPerDay,
            lootChancePercent: s.lootChancePercent,
            expectedCasesPerDay: s.expectedCasesPerDay + e.expectedCasesPerDay,
            expectedEliteCasesPerDay: s.expectedEliteCasesPerDay + e.expectedEliteCasesPerDay,
            expectedMythicCasesPerDay: s.expectedMythicCasesPerDay + e.expectedMythicCasesPerDay
        }
    }
    function ko(s, e) {
        const t = {};
        for (const o of ze) {
            const n = s.equipment[o]
              , a = e.equipment[o]
              , i = n ?? a;
            if (!i || n && a && n.code !== a.code)
                continue;
            const l = U([(n == null ? void 0 : n.stateLossPerDay) ?? null, (a == null ? void 0 : a.stateLossPerDay) ?? null])
              , r = (n == null ? void 0 : n.stateLossPerDay) != null && n.itemLifespanDays != null ? n.stateLossPerDay * n.itemLifespanDays : (a == null ? void 0 : a.stateLossPerDay) != null && a.itemLifespanDays != null ? a.stateLossPerDay * a.itemLifespanDays : null;
            t[o] = {
                ...i,
                stateLossPerDay: l,
                itemLifespanDays: r != null && l != null && l > 0 ? r / l : null,
                grossDailyCost: U([(n == null ? void 0 : n.grossDailyCost) ?? null, (a == null ? void 0 : a.grossDailyCost) ?? null]),
                scrapCredit: U([(n == null ? void 0 : n.scrapCredit) ?? null, (a == null ? void 0 : a.scrapCredit) ?? null]),
                dailyCost: U([(n == null ? void 0 : n.dailyCost) ?? null, (a == null ? void 0 : a.dailyCost) ?? null]),
                unavailableReason: (n == null ? void 0 : n.unavailableReason) ?? (a == null ? void 0 : a.unavailableReason) ?? null
            }
        }
        return t
    }
    function Et(s, e, t) {
        const o = Math.max(0, _(s == null ? void 0 : s.resourceHours, 24));
        return {
            ...s,
            resourceHours: o * e,
            damageMultiplier: _(s == null ? void 0 : s.damageMultiplier, 1) * t,
            ...(s == null ? void 0 : s.healthBudget) == null ? {} : {
                healthBudget: Math.max(0, _(s.healthBudget)) * e
            },
            ...(s == null ? void 0 : s.foodCount) == null ? {} : {
                foodCount: Math.max(0, _(s.foodCount)) * e
            }
        }
    }
    function xo(s) {
        var w, H, I;
        if (!s.pill)
            return $e(s);
        const e = Math.max(0, _((w = s.modifiers) == null ? void 0 : w.resourceHours, 24)) * Ct
          , t = Math.max(0, _((H = s.modifiers) == null ? void 0 : H.resourceHours, 24)) * bt
          , o = _((I = s.modifiers) == null ? void 0 : I.damageMultiplier, 1)
          , n = Dt(s.gameConfig)
          , a = s.debuffEquipment ?? go(n.items)
          , i = s.debuffFoodCode ?? "none"
          , l = $e({
            ...s,
            income: void 0,
            modifiers: Et(s.modifiers, Ct, yt),
            scope: s.scope ? `${s.scope}.pillBuff` : "pillBuff"
        })
          , r = $e({
            ...s,
            income: void 0,
            equipment: a,
            foodCode: i,
            modifiers: Et(s.modifiers, bt, Pt),
            scope: s.scope ? `${s.scope}.pillDebuff` : "pillDebuff"
        })
          , c = s.itemPrices ?? {}
          , u = O(c[ft])
          , h = U([l.costs.equipmentCost, r.costs.equipmentCost])
          , g = U([l.costs.foodCount, r.costs.foodCount])
          , d = U([l.costs.foodCost, r.costs.foodCost])
          , m = U([l.costs.caseLootValue, r.costs.caseLootValue])
          , f = U([l.costs.mythicCaseLootValue, r.costs.mythicCaseLootValue])
          , C = U([l.costs.lootCredit, r.costs.lootCredit])
          , b = U([l.costs.grossCost, r.costs.grossCost])
          , x = b == null || u == null ? null : b + u
          , R = l.costs.scrapCredit + r.costs.scrapCredit
          , y = s.income ? pt(s.income) : void 0
          , D = (y == null ? void 0 : y.incomeCoinsPerDay) ?? 0
          , M = x == null ? null : R + (C ?? 0) + D - x
          , S = l.finalDamage + r.finalDamage
          , A = St([...l.costs.unavailableReasons, ...r.costs.unavailableReasons, ...u == null ? ["pill-price-unavailable"] : []]);
        return {
            ...l,
            combat: Do(l.combat, r.combat),
            finalDamage: S,
            damagePerDay: S,
            costPerThousandDamage: Mt(M, S),
            costs: {
                equipment: ko(l.costs, r.costs),
                equipmentCost: h,
                pillPrice: u,
                pillCost: u,
                foodCount: g,
                foodPrice: l.costs.foodPrice,
                foodCost: d,
                scrapCredit: R,
                caseLootValue: m,
                mythicCaseLootValue: f,
                lootCredit: C,
                ...y ? {
                    incomeCredit: D
                } : {},
                grossCost: x,
                netCost: M,
                unavailableReasons: A
            },
            loot: {
                expectedCasesPerDay: l.loot.expectedCasesPerDay + r.loot.expectedCasesPerDay,
                expectedMythicCasesPerDay: l.loot.expectedMythicCasesPerDay + r.loot.expectedMythicCasesPerDay
            },
            ...y ? {
                income: y
            } : {},
            pill: {
                enabled: !0,
                itemCode: ft,
                price: u,
                cost: u,
                pilledDamagePerDay: l.finalDamage,
                nonPilledDamagePerDay: r.finalDamage,
                combinedDamagePerDay: S,
                buff: {
                    resourceHours: e,
                    damageMultiplier: o * yt,
                    damagePerDay: l.finalDamage,
                    equipment: s.equipment,
                    foodCode: s.foodCode,
                    combat: l.combat,
                    costs: l.costs
                },
                debuff: {
                    resourceHours: t,
                    damageMultiplier: o * Pt,
                    damagePerDay: r.finalDamage,
                    equipment: a,
                    foodCode: i,
                    combat: r.combat,
                    costs: r.costs
                }
            },
            breakdowns: [...l.breakdowns, ...r.breakdowns]
        }
    }
    const vo = {
        getGameConfigItems: () => ({}),
        getGameConfigSkills: () => ({}),
        getGameConfigBattle: () => ({}),
        getItemPrices: () => ({}),
        getEquipmentPrices: () => ({}),
        getEquipmentMarketRolls: () => []
    }
      , We = ["health", "hunger", "attack", "precision", "criticalChance", "criticalDamages", "armor", "dodge"]
      , ie = ["weapon", "ammo", "helmet", "chest", "pants", "boots", "gloves"]
      , re = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];
    function Ye(s, e, t, o, n) {
        if (t == null || !Number.isFinite(t) || s.some(i => i.grossCost == null))
            return null;
        let a = -t;
        for (const i of s)
            if (a -= i.grossCost,
            e.scraps && (a += i.scrapCredit),
            e.cases) {
                if (i.lootCredit == null)
                    return null;
                a += i.lootCredit
            }
        if (e.income && Number.isFinite(o) && (a += o),
        e.dailyWeekly) {
            if (n == null)
                return null;
            a += n
        }
        return Number.isFinite(a) ? a : null
    }
    const So = 1.6
      , wt = 18
      , Mo = "cocain";
    class Je {
        constructor(e, t=vo, o=!1) {
            P(this, "cachedPlayer", null);
            P(this, "cachedRevision", -1);
            P(this, "cachedSkillRevision", -1);
            P(this, "projectionCache", []);
            P(this, "fixedProjectionCache", []);
            P(this, "debuffPhases", new WeakMap);
            this.dataSources = t,
            this.cacheProjections = o
        }
        getConfiguredSkillValue(e, t) {
            var a, i;
            const o = (a = this.dataSources.getGameConfigSkills()[e]) == null ? void 0 : a.levels
              , n = (i = o == null ? void 0 : o[String(t)]) == null ? void 0 : i.value;
            return typeof n == "number" && Number.isFinite(n) ? n : null
        }
        getSkillValue(e, t) {
            var i, l, r, c;
            const o = (c = (r = (l = (i = this.dataSources).getCombatSkills) == null ? void 0 : l.call(i)) == null ? void 0 : r[e]) == null ? void 0 : c.value;
            if (typeof o == "number" && Number.isFinite(o))
                return o;
            const n = t.getSkill(e)
              , a = this.getConfiguredSkillValue(e, n);
            if (a != null)
                return a;
            switch (e) {
            case "attack":
                return 100 + n * 25;
            case "precision":
                return 50 + n * 5;
            case "criticalChance":
                return 10 + n * 5;
            case "criticalDamages":
                return 100 + n * 20;
            case "armor":
                return n * 6;
            case "dodge":
                return n * 4;
            case "health":
                return 100 + n * 10;
            case "hunger":
                return n * 10;
            case "lootChance":
                return n
            }
        }
        getDamageOutput(e) {
            return this.calculateProjection(e).damage.expectedDamagePerAttempt
        }
        getBattleHealthCost(e) {
            const t = this.dataSources.getGameConfigBattle().healthCost;
            return typeof t == "number" && Number.isFinite(t) && t > 0 ? t : e.getBattleHealthCost()
        }
        getArmorBreakpoint(e, t) {
            var n;
            const o = this.getSkillValue("armor", e) + t;
            return Ve(this.getBattleHealthCost(e), Ee(o, (n = this.dataSources.getGameConfigSkills().armor) == null ? void 0 : n.softCap))
        }
        getCombatPlayer(e) {
            var n, a;
            const t = (a = (n = this.dataSources).getCombatSkills) == null ? void 0 : a.call(n);
            if (t)
                return {
                    skills: t
                };
            const o = i => this.getSkillValue(i, e);
            return {
                skills: {
                    attack: {
                        value: o("attack"),
                        militaryRankPercent: e.getPlayerMilitaryRankAttackPercent()
                    },
                    precision: {
                        value: o("precision")
                    },
                    criticalChance: {
                        value: o("criticalChance")
                    },
                    criticalDamages: {
                        value: o("criticalDamages")
                    },
                    armor: {
                        value: o("armor")
                    },
                    dodge: {
                        value: o("dodge")
                    },
                    health: {
                        value: o("health")
                    },
                    hunger: {
                        value: o("hunger")
                    },
                    lootChance: {
                        value: o("lootChance")
                    }
                }
            }
        }
        getPhaseProjection(e, t={}, o, n) {
            return this.calculateProjection(e, t, o, n)
        }
        calculateProjection(e, t={}, o, n) {
            if (this.cacheProjections) {
                (this.cachedPlayer !== e || this.cachedSkillRevision !== e.getSkillRevision()) && (this.cachedSkillRevision = e.getSkillRevision(),
                this.fixedProjectionCache = []),
                (this.cachedPlayer !== e || this.cachedRevision !== e.getRevision()) && (this.cachedPlayer = e,
                this.cachedRevision = e.getRevision(),
                this.projectionCache = []);
                const r = (o != null && o.equipment && o.foodCode != null ? this.fixedProjectionCache : this.projectionCache).find(c => c.pill === !!t.pillEnabled && c.bonus === (t.battleBonusPercent ?? 0) && c.phase === o && c.hours === n);
                if (r)
                    return r.result
            }
            const a = Object.fromEntries(ie.map(l => {
                const r = e.getEquipment(l);
                return [l, r ? {
                    code: r.getCode(),
                    skills: r.getStats(),
                    maxState: r.getMaxState() ?? void 0
                } : null]
            }
            ))
              , i = xo({
                collectBreakdowns: !1,
                player: this.getCombatPlayer(e),
                equipment: (o == null ? void 0 : o.equipment) ?? a,
                foodCode: (o == null ? void 0 : o.foodCode) ?? e.getFood(),
                gameConfig: {
                    items: this.dataSources.getGameConfigItems(),
                    skills: this.dataSources.getGameConfigSkills(),
                    battle: {
                        healthCost: this.getBattleHealthCost(e)
                    }
                },
                itemPrices: this.dataSources.getItemPrices(),
                equipmentPrices: this.dataSources.getEquipmentPrices(),
                modifiers: {
                    battleBonusPercent: t.battleBonusPercent,
                    damageMultiplier: (o == null ? void 0 : o.multiplier) ?? (t.pillEnabled ? So : 1),
                    resourceHours: n ?? (o ? 0 : t.pillEnabled ? wt : 24),
                    ...o && n == null ? {
                        healthBudget: o.health,
                        foodCount: o.food,
                        resourceUsageMode: "discrete"
                    } : {}
                }
            });
            if (this.cacheProjections) {
                const l = o != null && o.equipment && o.foodCode != null ? this.fixedProjectionCache : this.projectionCache;
                l.length >= 8 && l.shift(),
                l.push({
                    pill: !!t.pillEnabled,
                    bonus: t.battleBonusPercent ?? 0,
                    phase: o,
                    hours: n,
                    result: i
                })
            }
            return i
        }
        getPillPrice() {
            const e = this.dataSources.getItemPrices()[Mo];
            return typeof e == "number" && Number.isFinite(e) ? e : null
        }
        calculateDailySpending(e, t={}) {
            const o = this.calculateProjection(e, t)
              , n = t.pillEnabled ? this.getPillPrice() : 0
              , a = Object.values(o.costs.equipment);
            return o.costs.foodCost == null || n == null || a.some(i => i.dailyCost == null && (i.stateLossPerDay ?? 0) > 0) ? 0 : a.reduce( (i, l) => i + (l.dailyCost ?? 0), 0) + o.costs.foodCost + n
        }
        calculateDailyNetCost(e, t={}) {
            const o = this.calculateProjection(e, t);
            return this.calculateDailySpending(e, t) - (o.costs.lootCredit ?? 0)
        }
        getPricedDailyPoint(e, t={}) {
            return Eo(this.calculateProjection(e, t), this.dataSources.getItemPrices(), t)
        }
        getDisplayedDailyPhases(e, t) {
            const o = t.dailyContext
              , n = [this.calculateProjection(e, t)];
            if (t.pillEnabled && o) {
                const a = o.debuffBuild
                  , i = {
                    ...t,
                    pillEnabled: !1
                };
                let l = this.cacheProjections ? this.debuffPhases.get(o) : void 0;
                l ?? (l = {
                    health: 0,
                    food: 0,
                    multiplier: .4,
                    ...a ? {
                        equipment: a.equipment,
                        foodCode: a.foodCode
                    } : {}
                }),
                this.cacheProjections && this.debuffPhases.set(o, l),
                n.push(this.calculateProjection(e, i, l, 6))
            }
            return n
        }
        getDisplayedDailySpending(e, t) {
            const o = t.dailyContext;
            if (!o)
                return null;
            const n = Ye(this.getDisplayedDailyPhases(e, t).map(a => a.costs), {
                ...o.settings,
                cases: !1,
                income: !1,
                dailyWeekly: !1
            }, t.pillEnabled ? this.getPillPrice() : 0, 0, 0);
            return n == null ? null : -n
        }
        getDisplayedDailyPoint(e, t={}) {
            const o = t.dailyContext;
            if (!o)
                return this.getPricedDailyPoint(e, t);
            const n = this.getDisplayedDailyPhases(e, t)
              , a = Ye(n.map(i => i.costs), o.settings, t.pillEnabled ? this.getPillPrice() : 0, o.incomeCredit, o.rewardCredit);
            return a == null ? null : {
                damagePerDay: n.reduce( (i, l) => i + l.finalDamage, 0),
                dailyNetCost: -a
            }
        }
        calculateDailyBudgetCost(e, t={}) {
            return Math.max(0, this.calculateDailyNetCost(e, t))
        }
        calculateRoundNetCost(e, t) {
            if (!t.round)
                return null;
            let o = 0;
            for (const n of t.round.phases) {
                if (n.health <= 0 && n.food < 1)
                    continue;
                const a = this.calculateProjection(e, t, n).costs.netCost;
                if (a == null)
                    return null;
                o -= a
            }
            return o
        }
        hasPricedDailyInputs(e, t={}) {
            const o = this.calculateProjection(e, t);
            return o.costs.foodCost != null && (!t.pillEnabled || this.getPillPrice() != null) && Object.values(o.costs.equipment).every(n => n.dailyCost != null || !((n.stateLossPerDay ?? 0) > 0))
        }
        getObjectivePoint(e, t={}) {
            let o;
            if (t.dailyContext) {
                const n = this.getDisplayedDailyPoint(e, t);
                if (!n)
                    return null;
                o = n.dailyNetCost
            } else {
                if (!this.hasPricedDailyInputs(e, t))
                    return null;
                o = this.calculateDailyNetCost(e, t)
            }
            return {
                damagePerDay: this.getDamagePerDay(e, t),
                dailyNetCost: o,
                ...t.round ? {
                    roundNetCost: this.calculateRoundNetCost(e, t)
                } : {}
            }
        }
        getBudgetCost(e, t={}) {
            const o = t.dailyContext;
            if (!o)
                return this.hasPricedDailyInputs(e, t) ? this.calculateDailyNetCost(e, t) : null;
            const n = Ye(this.getDisplayedDailyPhases(e, t).map(a => a.costs), {
                ...o.settings,
                income: !1,
                dailyWeekly: !1
            }, t.pillEnabled ? this.getPillPrice() : 0, 0, 0);
            return n == null ? null : -n
        }
        getDailyCombatEstimate(e, t={}) {
            return this.calculateProjection(e, t).combat
        }
        getHitsPerDay(e, t={}) {
            return this.getDailyCombatEstimate(e, t).attemptedHitsPerDay
        }
        getEffectiveHitsPerHour(e, t={}) {
            return this.getHitsPerDay(e, t) / (t.pillEnabled ? wt : 24)
        }
        getDamagePerDay(e, t={}) {
            return t.round ? t.round.existingDamage + t.round.phases.reduce( (o, n) => o + (n.health > 0 || n.food >= 1 ? this.calculateProjection(e, t, n).finalDamage : 0), 0) : this.calculateProjection(e, t).finalDamage
        }
        getCaseEarningsPerDay(e, t={}) {
            return this.calculateProjection(e, t).costs.lootCredit
        }
    }
    function Eo(s, e, t) {
        const o = s.costs
          , n = t.pillEnabled ? e.cocain : 0
          , a = Object.values(o.equipment);
        if (o.foodCost == null || o.lootCredit == null || n == null || !Number.isFinite(n) || a.some(l => l.dailyCost == null && (l.stateLossPerDay ?? 0) > 0))
            return null;
        const i = a.reduce( (l, r) => l + (r.dailyCost ?? 0), 0) + o.foodCost + n - o.lootCredit;
        return Number.isFinite(i) && Number.isFinite(s.finalDamage) ? {
            damagePerDay: s.finalDamage,
            dailyNetCost: i
        } : null
    }
    class Ze {
        constructor() {
            P(this, "revision", 0);
            P(this, "skillRevision", 0);
            P(this, "playerLevel", 1);
            P(this, "playerMilitaryRankAttackPercent", 0);
            P(this, "battleHealthCost", 10);
            P(this, "food", "none");
            P(this, "skills", {
                production: 0,
                energy: 0,
                entrepreneurship: 0,
                companies: 0,
                management: 0,
                health: 0,
                hunger: 0,
                attack: 0,
                precision: 0,
                criticalChance: 0,
                criticalDamages: 0,
                armor: 0,
                dodge: 0,
                lootChance: 0
            });
            P(this, "equipment", {
                weapon: null,
                ammo: null,
                helmet: null,
                chest: null,
                pants: null,
                boots: null,
                gloves: null
            })
        }
        static calculateSkillCost(e) {
            let t = 0;
            for (let o = 1; o <= e; o += 1)
                t += o;
            return t
        }
        setPlayerLevel(e) {
            this.playerLevel !== e && (this.revision++,
            this.skillRevision++),
            this.playerLevel = e
        }
        setPlayerMilitaryRankAttackPercent(e) {
            this.revision++,
            this.skillRevision++,
            this.playerMilitaryRankAttackPercent = typeof e == "number" && Number.isFinite(e) ? e : 0
        }
        getPlayerLevel() {
            return this.playerLevel
        }
        getTotalSkillPoints() {
            return this.playerLevel * 4
        }
        getPlayerMilitaryRankAttackPercent() {
            return this.playerMilitaryRankAttackPercent
        }
        getBattleHealthCost() {
            return this.battleHealthCost
        }
        getFood() {
            return this.food
        }
        getHealth() {
            return this.getSkill("health")
        }
        getHunger() {
            return this.getSkill("hunger")
        }
        setSkill(e, t) {
            this.skills[e] !== t && (this.revision++,
            this.skillRevision++),
            this.skills[e] = t
        }
        getSkill(e) {
            return this.skills[e]
        }
        getEquipment(e) {
            return this.equipment[e]
        }
        setEquipment(e, t) {
            this.equipment[e] !== t && this.revision++,
            this.equipment[e] = t
        }
        setFood(e) {
            this.food !== e && this.revision++,
            this.food = e
        }
        getRevision() {
            return this.revision
        }
        getSkillRevision() {
            return this.skillRevision
        }
        toJSON() {
            return {
                playerLevel: this.playerLevel,
                playerMilitaryRankAttackPercent: this.playerMilitaryRankAttackPercent,
                battleHealthCost: this.battleHealthCost,
                food: this.food,
                skills: this.skills,
                equipment: this.equipment
            }
        }
    }
    const wo = new Intl.Collator(void 0,{
        numeric: !0
    });
    function Qe(s, e) {
        var a, i;
        const t = typeof s == "string" ? {
            code: s
        } : s
          , o = typeof e == "string" ? {
            code: e
        } : e
          , n = wo.compare((t == null ? void 0 : t.code) ?? "", (o == null ? void 0 : o.code) ?? "");
        if (n)
            return n;
        for (const l of [...new Set([...Object.keys((t == null ? void 0 : t.skills) ?? {}), ...Object.keys((o == null ? void 0 : o.skills) ?? {})])].sort()) {
            const r = (((a = t == null ? void 0 : t.skills) == null ? void 0 : a[l]) ?? 0) - (((i = o == null ? void 0 : o.skills) == null ? void 0 : i[l]) ?? 0);
            if (r)
                return r
        }
        return 0
    }
    function Rt(s, e) {
        for (const t of ie) {
            const o = Qe(s[t], e[t]);
            if (o)
                return o
        }
        return 0
    }
    function Ro(s) {
        return Object.fromEntries(ie.map(e => {
            const t = s.getEquipment(e);
            if (!t)
                return [e, null];
            const o = t.getConfigItem()
              , n = t.getStats();
            if (e === "ammo" && !o.dynamicStats)
                return [e, t.getCode()];
            const a = {
                code: t.getCode()
            };
            typeof o.type == "string" && o.type && (a.type = o.type),
            Object.keys(n).length && (a.skills = n);
            const i = t.getMaxState() ?? 100;
            return a.maxState = i,
            a.state = i,
            [e, a]
        }
        ))
    }
    function No(s) {
        if (!Number.isFinite(s) || s < 0)
            throw new Error("Invalid damage target");
        return Math.max(0, s - 3e5)
    }
    function Ao(s) {
        const e = No(s)
          , t = s + 3e5
          , o = [];
        for (let n = e; n < t; n += 25e3)
            o.push(n);
        return o.includes(s) || o.push(s),
        o.push(t),
        [...new Set(o)].sort( (n, a) => n - a)
    }
    class V {
        constructor(e, t, o, n) {
            P(this, "code");
            P(this, "stats");
            P(this, "gameConfigItems");
            this.dataSources = n,
            this.gameConfigItems = e,
            this.code = t,
            this.stats = o
        }
        static isCompatible(e, t) {
            return kt(e, t)
        }
        static getMinimumStats(e) {
            return e.dynamicStats ? Object.fromEntries(Object.entries(e.dynamicStats).map( ([t,o]) => [t, o[0]])) : e.flatStats ? {
                ...e.flatStats
            } : {}
        }
        static createLowestForSlot(e, t) {
            const o = Object.values(e).filter(a => V.isCompatible(t, a));
            if (!o.length)
                return null;
            const n = o.reduce( (a, i) => {
                const l = re.indexOf(a.rarity ?? "")
                  , r = re.indexOf(i.rarity ?? "");
                return l === -1 ? i : r === -1 ? a : r < l ? i : a
            }
            );
            return n.code ? new V(e,n.code,V.getMinimumStats(n)) : null
        }
        getConfigItem() {
            return this.gameConfigItems[this.code] ?? {
                code: this.code,
                flatStats: this.stats
            }
        }
        getCode() {
            return this.code
        }
        getStats() {
            return {
                ...this.stats
            }
        }
        getStat(e) {
            return this.stats[e] ?? 0
        }
        getRarity() {
            const e = this.getConfigItem().rarity;
            return typeof e == "string" ? e : null
        }
        getMaxState() {
            const e = this.getConfigItem().maxState;
            return typeof e == "number" && Number.isFinite(e) ? e : null
        }
        getBrokenScrapCount() {
            if (this.getConfigItem().usage === "ammo")
                return 0;
            const t = this.getRarity();
            return t ? Ge(t, 0) ?? 0 : 0
        }
        getPrice() {
            var t, o;
            if (this.getConfigItem().usage === "ammo") {
                const n = (t = this.dataSources) == null ? void 0 : t.getItemPrices()[this.code];
                return typeof n == "number" && Number.isFinite(n) ? n : null
            }
            const e = (o = this.dataSources) == null ? void 0 : o.getEquipmentPrices()[Me(this.code, this.stats)];
            return typeof e == "number" && Number.isFinite(e) ? e : null
        }
        getBrokenScrapValue() {
            var o;
            const e = (o = this.dataSources) == null ? void 0 : o.getItemPrices().scraps
              , t = this.getBrokenScrapCount();
            return t <= 0 || typeof e != "number" || !Number.isFinite(e) ? 0 : t * e
        }
        getNetCost() {
            const e = this.getPrice();
            return e == null ? null : Math.max(0, e - this.getBrokenScrapValue())
        }
        setLowestStats() {
            this.stats = V.getMinimumStats(this.getConfigItem())
        }
        getFirstStatKey() {
            return Object.keys(this.stats)[0]
        }
        getFirstStatValue() {
            const e = this.getFirstStatKey();
            return this.stats[e]
        }
        getFirstStatRange() {
            var n;
            const e = this.getFirstStatKey()
              , o = (n = this.getConfigItem().dynamicStats) == null ? void 0 : n[e];
            return {
                min: o ? o[0] : 0,
                max: o ? o[1] : 0
            }
        }
        getUpgradeFamilyKey(e) {
            var n;
            const t = e.code ?? ""
              , o = (n = t.match(/^([A-Za-z]+)\d+$/)) == null ? void 0 : n[1];
            return o ? `code:${o}` : typeof e.type == "string" && e.type ? `type:${e.type}` : typeof e.usage == "string" && e.usage ? `usage:${e.usage}` : typeof e.skinSlot == "string" && e.skinSlot ? `skinSlot:${e.skinSlot}` : `code:${t.replace(/\d+$/, "")}`
        }
        getNextRarityItem() {
            const e = this.getConfigItem()
              , t = re.findIndex(n => n === e.rarity);
            if (t === -1 || t === re.length - 1)
                return null;
            const o = this.getUpgradeFamilyKey(e);
            return Object.values(this.gameConfigItems).find(n => !!n.code && this.getUpgradeFamilyKey(n) === o && n.rarity === re[t + 1])
        }
        getPreviousRarityItem() {
            const e = this.getConfigItem()
              , t = re.findIndex(n => n === e.rarity);
            if (t <= 0)
                return null;
            const o = this.getUpgradeFamilyKey(e);
            return Object.values(this.gameConfigItems).find(n => !!n.code && this.getUpgradeFamilyKey(n) === o && n.rarity === re[t - 1])
        }
        upgradeOneStat() {
            const e = this.getFirstStatKey()
              , t = this.stats[e]
              , o = this.getFirstStatRange().max;
            if (!e || typeof t != "number" || !Number.isFinite(t) || !Number.isFinite(o) || t >= o)
                return !1;
            const n = Math.min(t + 1, o);
            return this.stats[e] = n,
            n !== t
        }
        upgradeOneRarity() {
            const e = this.getNextRarityItem();
            return !e || !e.code ? !1 : (this.code = e.code,
            this.setLowestStats(),
            !0)
        }
        upgrade() {
            return this.upgradeOneStat() || this.upgradeOneRarity()
        }
        downgrade() {
            const e = this.getFirstStatValue()
              , t = this.getFirstStatRange().min;
            if (e === t) {
                const a = this.getPreviousRarityItem();
                if (!a || !a.code)
                    return;
                this.code = a.code,
                this.setLowestStats();
                return
            }
            const o = this.getFirstStatKey()
              , n = Math.max(e - 1, t);
            this.stats[o] = n
        }
        toJSON() {
            return {
                code: this.code,
                rarity: this.getRarity(),
                maxState: this.getMaxState() ?? 100,
                brokenScrapValue: this.getBrokenScrapValue(),
                netCost: this.getNetCost(),
                stats: this.stats
            }
        }
    }
    const Fo = ["attack", "criticalChance", "criticalDamages", "criticalDamage", "precision", "armor", "dodge"]
      , Ho = {
        weapon: ["attack", "criticalChance"],
        helmet: ["criticalDamages", "criticalDamage"],
        chest: ["armor"],
        pants: ["armor"],
        boots: ["dodge"],
        gloves: ["precision"]
    };
    function Lo(s, e) {
        if (s === "ammo")
            return null;
        for (const [t,o] of Object.entries(e))
            if (Fo.includes(t) && Number.isFinite(o) && o !== 0 && !Ho[s].includes(t))
                return `${s}:${t}`;
        return null
    }
    const Nt = new Set(["gun", "rifle", "sniper", "tank", "jet"])
      , Bo = ["bread", "steak", "cookedFish"]
      , At = ["bread", "steak", "cookedFish", "none"];
    function j(s) {
        return typeof s == "number" && Number.isFinite(s) ? s : null
    }
    function Oo(s) {
        return s.dynamicStats ? Object.fromEntries(Object.entries(s.dynamicStats).map( ([e,t]) => [e, t[0]])) : s.flatStats ? {
            ...s.flatStats
        } : {}
    }
    function ge(s, e) {
        return Qe(je(s.item), je(e.item))
    }
    function je(s) {
        return s ? {
            code: s.getCode(),
            skills: s.getStats()
        } : null
    }
    class Io {
        constructor(e) {
            P(this, "variant");
            P(this, "infeasibleReason", null);
            P(this, "fallbackReason", null);
            P(this, "items");
            P(this, "options");
            P(this, "attack");
            P(this, "precision");
            P(this, "criticalChance");
            P(this, "criticalDamage");
            P(this, "militaryFactor");
            P(this, "bonusMultiplier");
            P(this, "lootPerPreciseAttempt");
            P(this, "weapons", []);
            P(this, "ammo", []);
            P(this, "ammoLocked");
            P(this, "helmets", []);
            P(this, "gloves", []);
            P(this, "armor", []);
            P(this, "dodge", []);
            P(this, "foods", []);
            P(this, "sources");
            P(this, "helper");
            P(this, "player");
            P(this, "playerSnapshot");
            P(this, "healthRegen");
            P(this, "hungerRegen");
            P(this, "healthCost");
            P(this, "maxHealth");
            P(this, "armorBase");
            P(this, "dodgeBase");
            P(this, "pillPrice");
            P(this, "targetPhases");
            P(this, "displayedPhases");
            P(this, "costPhases");
            P(this, "configs", new Map);
            P(this, "fixedDamage", new Map);
            var ye, we, Re, Ne, ue, Y, Ae, se, Pe, Fe, He;
            this.setup = e;
            const {sources: t, helper: o, options: n, locks: a} = e;
            this.sources = t,
            this.helper = o,
            this.options = n,
            this.items = t.getGameConfigItems();
            const i = t.getItemPrices()
              , l = t.getGameConfigSkills()
              , r = n.dailyContext;
            this.variant = r ? {
                metric: "displayed",
                scraps: r.settings.scraps,
                cases: r.settings.cases
            } : {
                metric: "priced",
                scraps: !0,
                cases: !0
            },
            this.player = new Ze,
            this.player.setPlayerLevel(e.player.getPlayerLevel()),
            this.player.setPlayerMilitaryRankAttackPercent(e.player.getPlayerMilitaryRankAttackPercent());
            for (const p of [...We, "lootChance"])
                this.player.setSkill(p, e.player.getSkill(p));
            this.playerSnapshot = o.getCombatPlayer(this.player);
            const c = p => G(this.playerSnapshot, p, l);
            this.attack = c("attack"),
            this.precision = c("precision"),
            this.criticalChance = c("criticalChance"),
            this.criticalDamage = c("criticalDamages"),
            this.maxHealth = c("health"),
            this.healthRegen = j((we = (ye = this.playerSnapshot.skills) == null ? void 0 : ye.health) == null ? void 0 : we.hourlyBarRegen) ?? this.maxHealth / 10,
            this.hungerRegen = j((Ne = (Re = this.playerSnapshot.skills) == null ? void 0 : Re.hunger) == null ? void 0 : Ne.hourlyBarRegen) ?? c("hunger") / 10,
            this.armorBase = c("armor"),
            this.dodgeBase = c("dodge"),
            this.militaryFactor = 1 + (j((Y = (ue = this.playerSnapshot.skills) == null ? void 0 : ue.attack) == null ? void 0 : Y.militaryRankPercent) ?? 0) / 100,
            this.healthCost = o.getBattleHealthCost(this.player);
            const u = Number.isFinite(n.battleBonusPercent) ? Math.max(-100, n.battleBonusPercent ?? 0) : 0;
            this.bonusMultiplier = 1 + u / 100;
            const h = c("lootChance")
              , g = j(i.case1)
              , d = j(i.case2);
            this.lootPerPreciseAttempt = this.variant.cases ? h / 100 * (g ?? 0) + h / 1e4 * (d ?? 0) : 0,
            this.pillPrice = n.pillEnabled ? j(i.cocain) ?? Number.NaN : 0;
            const m = p => {
                this.infeasibleReason ?? (this.infeasibleReason = p)
            }
              , f = p => {
                this.fallbackReason ?? (this.fallbackReason = p)
            }
            ;
            Number.isFinite(this.pillPrice) || m("pill-price-missing"),
            r && r.settings.cases && g == null && d == null && m("case-price-missing"),
            r && r.settings.dailyWeekly && r.rewardCredit == null && m("reward-credit-missing");
            const C = j(i.scraps)
              , b = t.getEquipmentPrices()
              , x = new Map
              , R = new Set;
            for (const p of t.getEquipmentMarketRolls()) {
                const k = this.items[p.code];
                if (!(k != null && k.code) || !fo(k, p.skills))
                    continue;
                const v = Me(p.code, p.skills);
                if (!(R.has(v) || j(b[v]) == null)) {
                    R.add(v);
                    for (const F of ["weapon", "helmet", "chest", "pants", "boots", "gloves"]) {
                        if (!kt(F, k))
                            continue;
                        const q = x.get(F) ?? [];
                        q.push(new V(this.items,p.code,p.skills,t)),
                        x.set(F, q)
                    }
                }
            }
            const y = p => {
                if (p in a) {
                    const k = a[p] ?? null;
                    return [k ? new V(this.items,k.getCode(),k.getStats(),t) : null]
                }
                return [null, ...x.get(p) ?? []]
            }
              , D = (p, k) => {
                if (!k)
                    return {
                        stats: {},
                        weight: 0
                    };
                const v = k.getCode()
                  , F = this.items[v]
                  , q = {
                    code: v,
                    skills: k.getStats(),
                    maxState: k.getMaxState() ?? void 0
                }
                  , J = Se(q, this.items)
                  , Z = Lo(p, J);
                Z && f(`non-separable:${Z}`);
                const Q = j((F == null ? void 0 : F.usage) === "ammo" ? i[v] : b[Me(v, J)])
                  , Ce = xt(q, F);
                return Q == null || Ce == null ? {
                    stats: J,
                    weight: Number.NaN
                } : {
                    stats: J,
                    weight: this.wearWeight(Q, Ce, vt(v, F), C)
                }
            }
              , M = (p, k) => y(p).flatMap(v => {
                const {stats: F, weight: q} = D(p, v);
                if (Number.isNaN(q))
                    return m("locked-item-unpriced"),
                    [];
                const J = k.map(Z => j(F[Z])).find(Z => Z != null) ?? 0;
                return [{
                    item: v,
                    value: J,
                    weight: q,
                    stats: F
                }]
            }
            );
            for (const p of M("weapon", ["attack"])) {
                const k = (Ae = p.item) == null ? void 0 : Ae.getCode()
                  , v = k ? (se = this.items[k]) == null ? void 0 : se.type : void 0;
                this.weapons.push({
                    item: p.item,
                    value: p.value,
                    weight: p.weight,
                    attack: j(p.stats.attack) ?? 0,
                    criticalChance: j(p.stats.criticalChance) ?? 0,
                    requiresAmmo: !!(k && (Nt.has(k) || typeof v == "string" && Nt.has(v)))
                })
            }
            this.helmets.push(...M("helmet", ["criticalDamages", "criticalDamage"])),
            this.gloves.push(...M("gloves", ["precision"])),
            this.ammoLocked = "ammo" in a;
            const S = p => {
                if (!p)
                    return {
                        item: null,
                        percent: 0,
                        price: 0
                    };
                const k = Se({
                    code: p.getCode(),
                    skills: p.getStats()
                }, this.items);
                return {
                    item: p,
                    percent: j(k.percentAttack ?? k.attackPercent) ?? 0,
                    price: j(i[p.getCode()])
                }
            }
            ;
            if (this.ammoLocked) {
                const p = a.ammo ?? null;
                this.ammo.push(S(p ? new V(this.items,p.getCode(),p.getStats(),t) : null)),
                !p && "weapon" in a && this.weapons.some(k => k.requiresAmmo) && m("locked-weapon-needs-ammo")
            } else
                for (const p of Object.values(this.items))
                    p.usage !== "ammo" || !p.code || j(i[p.code]) == null || this.ammo.push(S(new V(this.items,p.code,Oo(p),t)));
            const A = p => {
                const k = new Map;
                for (const v of p) {
                    const F = k.get(v.value);
                    (!F || v.weight < F.weight || v.weight === F.weight && ge(v, F) < 0) && k.set(v.value, v)
                }
                return [...k.values()]
            }
              , w = A(M("chest", ["armor"]))
              , H = A(M("pants", ["armor"]))
              , I = (Pe = l.armor) == null ? void 0 : Pe.softCap
              , K = new Map;
            for (const p of w)
                for (const k of H) {
                    const v = Ve(this.healthCost, Ee(this.armorBase + (p.value + k.value), I))
                      , F = p.weight + k.weight
                      , q = K.get(v);
                    (!q || F < q.weight || F === q.weight && (ge(p, q.chest) || ge(k, q.pants)) < 0) && K.set(v, {
                        loss: v,
                        chest: p,
                        pants: k,
                        weight: F
                    })
                }
            this.armor.push(...[...K.values()].sort( (p, k) => p.loss - k.loss));
            const te = (Fe = l.dodge) == null ? void 0 : Fe.softCap
              , ce = new Map;
            for (const p of A(M("boots", ["dodge"]))) {
                const k = de(ae(Ee(this.dodgeBase + p.value, te), 0, 100))
                  , v = ce.get(k);
                (!v || p.weight < v.weight || p.weight === v.weight && ge(p, v.boots) < 0) && ce.set(k, {
                    dodge: k,
                    nonDodge: Math.max(1e-6, 1 - k / 100),
                    boots: p,
                    weight: p.weight
                })
            }
            this.dodge.push(...[...ce.values()].sort( (p, k) => p.dodge - k.dodge));
            for (const p of At) {
                const k = p === "none" ? 0 : j(i[p])
                  , v = ct(p, this.maxHealth, this.items);
                k == null || v == null || this.foods.push({
                    code: p,
                    price: k,
                    health: Math.max(0, v)
                })
            }
            const oe = !!n.pillEnabled
              , W = {
                kind: "variable",
                hours: oe ? 18 : 24,
                multiplier: oe ? 1.6 : 1
            };
            this.targetPhases = n.round ? n.round.phases.filter(p => p.health > 0 || p.food >= 1).map(p => p.equipment ? {
                kind: "fixed",
                phase: p,
                options: n
            } : {
                kind: "variable",
                hours: 0,
                multiplier: p.multiplier,
                discrete: {
                    health: p.health,
                    food: p.food
                },
                foodOverride: p.foodCode
            }) : [W];
            const $ = oe && r ? r.debuffBuild ? {
                kind: "fixed",
                options: {
                    ...n,
                    pillEnabled: !1
                },
                hours: 6,
                phase: {
                    health: 0,
                    food: 0,
                    multiplier: .4,
                    equipment: r.debuffBuild.equipment,
                    foodCode: r.debuffBuild.foodCode
                }
            } : {
                kind: "variable",
                hours: 6,
                multiplier: .4
            } : null;
            this.displayedPhases = $ ? [W, $] : [W],
            this.costPhases = this.variant.metric === "displayed" ? this.displayedPhases : [W],
            ($ == null ? void 0 : $.kind) === "fixed" && this.fixedPhase($, ((He = this.foods[0]) == null ? void 0 : He.code) ?? "none").costs.grossCost == null && m("debuff-price-missing")
        }
        wearWeight(e, t, o, n) {
            const a = e / t
              , i = Ge(o, 0)
              , l = i != null && n != null ? i * n / t : 0;
            return this.variant.metric === "priced" ? Math.max(0, a - l) : this.variant.scraps ? a - l : a
        }
        fixedPhase(e, t) {
            return this.player.setFood(t),
            this.helper.getPhaseProjection(this.player, e.options, e.phase, e.hours)
        }
        fixedDamageValue(e, t) {
            const o = `${this.targetPhases.indexOf(e)}:${this.displayedPhases.indexOf(e)}:${t}`;
            let n = this.fixedDamage.get(o);
            return n == null && (n = this.fixedPhase(e, t).finalDamage,
            this.fixedDamage.set(o, n)),
            n
        }
        counts(e, t, o, n) {
            const a = e.foodOverride ? this.foods.find(C => C.code === e.foodOverride) ?? n : n
              , i = Math.max(0, this.healthRegen * (e.hours / 24))
              , l = Math.max(0, this.hungerRegen * (e.hours / 24))
              , r = e.discrete
              , c = r ? Math.max(0, r.food) : l * 24
              , u = r ? Math.floor(c) : c
              , g = (r ? Math.max(0, r.health) : i * 24) + a.health * u
              , d = this.healthCost > 0 && t > 0 ? g / t : 0
              , m = r ? Math.floor(d) : d
              , f = this.healthCost > 0 ? m / o : 0;
            return {
                attempts: f,
                wearHits: f * o,
                foodCost: a.code === "none" ? 0 : u * a.price
            }
        }
        damageTerms(e, t, o, n, a) {
            const i = [];
            for (const l of e)
                l.kind === "fixed" ? i.push(this.fixedDamageValue(l, n.code)) : i.push({
                    attempts: this.counts(l, t, o, n).attempts,
                    multiplier: Math.max(0, l.multiplier)
                });
            return {
                constant: a ? Math.max(0, this.options.round.existingDamage) : 0,
                terms: i
            }
        }
        getConfigs(e) {
            let t = this.configs.get(e.code);
            if (t)
                return t;
            t = [];
            const o = this.options.dailyContext
              , n = this.variant.scraps ? 1 : 0
              , a = this.variant.cases ? 1 : 0
              , i = this.variant.metric === "displayed" && o ? (o.settings.income && Number.isFinite(o.incomeCredit) ? o.incomeCredit : 0) + (o.settings.dailyWeekly ? o.rewardCredit ?? 0 : 0) : 0;
            for (const l of this.armor)
                for (const r of this.dodge) {
                    let c = 0
                      , u = 0
                      , h = this.pillPrice;
                    for (const m of this.costPhases) {
                        if (m.kind === "fixed") {
                            const C = this.fixedPhase(m, e.code).costs;
                            h += (C.grossCost ?? Number.NaN) - n * C.scrapCredit - a * (C.lootCredit ?? 0);
                            continue
                        }
                        const f = this.counts(m, l.loss, r.nonDodge, e);
                        c += f.attempts,
                        u += f.wearHits,
                        h += f.foodCost
                    }
                    const g = this.damageTerms(this.targetPhases, l.loss, r.nonDodge, e, !!this.options.round)
                      , d = this.damageTerms(this.displayedPhases, l.loss, r.nonDodge, e, !1);
                    t.push({
                        food: e,
                        armor: l,
                        dodge: r,
                        nonDodge: r.nonDodge,
                        target: g,
                        displayed: d,
                        costAttempts: c,
                        costHits: u,
                        costConstant: h + u * (l.weight + r.weight) - i,
                        budgetOffset: i,
                        targetSlope: this.slope(g),
                        displayedSlope: this.slope(d)
                    })
                }
            return this.configs.set(e.code, t),
            t
        }
        slope(e) {
            let t = 0;
            for (const o of e.terms)
                typeof o != "number" && (t += o.attempts * o.multiplier * this.bonusMultiplier);
            return t
        }
        damage(e, t, o) {
            let n = 0;
            for (const a of e.terms)
                n += typeof a == "number" ? a : a.attempts * t * a.multiplier * this.bonusMultiplier;
            return o ? e.constant + n : n
        }
        targetDamage(e, t) {
            return this.damage(e.target, t, !!this.options.round)
        }
        displayedDamage(e, t) {
            return this.damage(e.displayed, t, !1)
        }
    }
    function qo(s, e) {
        var t, o;
        return s.cost - e.cost || ge(s.weapon, e.weapon) || Qe(je(((t = s.ammo) == null ? void 0 : t.item) ?? null), je(((o = e.ammo) == null ? void 0 : o.item) ?? null))
    }
    class jo {
        constructor(e) {
            P(this, "allUnits");
            P(this, "pruned");
            P(this, "full", null);
            P(this, "staircases", new Map);
            P(this, "unionDpa", null);
            P(this, "unionRec", null);
            this.model = e,
            this.allUnits = this.createUnits(),
            this.pruned = this.createLists(this.pruneUnits(this.allUnits), this.pruneSingles(e.helmets), this.pruneSingles(e.gloves))
        }
        createUnits() {
            const e = this.model
              , t = []
              , o = (n, a, i) => {
                const l = i && a ? a.percent : 0;
                t.push({
                    weapon: n,
                    ammo: a,
                    base: Math.max(0, e.attack + n.attack),
                    ammoFactor: 1 + l / 100,
                    critical: ae(e.criticalChance + n.criticalChance, 0, 100) / 100,
                    cost: n.weight + (i && a ? a.price ?? 0 : 0)
                })
            }
            ;
            for (const n of e.weapons)
                if (e.ammoLocked) {
                    const a = e.ammo[0] ?? null
                      , i = n.requiresAmmo && !!(a != null && a.item);
                    if (n.requiresAmmo && (!i || (a == null ? void 0 : a.price) == null))
                        continue;
                    o(n, a, i)
                } else if (n.requiresAmmo)
                    for (const a of e.ammo)
                        o(n, a, !0);
                else
                    o(n, null, !1);
            return t.sort(qo)
        }
        pruneUnits(e) {
            const t = [];
            for (const o of e)
                t.some(n => n.base >= o.base && n.critical >= o.critical && n.ammoFactor >= o.ammoFactor) || t.push(o);
            return t
        }
        pruneSingles(e) {
            const t = [...e].sort( (a, i) => a.weight - i.weight || i.value - a.value || ge(a, i))
              , o = [];
            let n = Number.NEGATIVE_INFINITY;
            for (const a of t)
                a.value > n && (o.push(a),
                n = a.value);
            return o
        }
        createLists(e, t, o) {
            const n = this.model
              , a = new Float64Array(o.length)
              , i = new Float64Array(o.length)
              , l = new Float64Array(o.length);
            return o.forEach( (r, c) => {
                const u = Math.max(0, n.precision + r.value);
                a[c] = Math.min(100, u) / 100,
                i[c] = Math.max(0, u - 100) * 4,
                l[c] = r.weight
            }
            ),
            {
                units: e,
                helmets: t,
                gloves: o,
                unitCost: Float64Array.from(e, r => r.cost),
                unitCritical: Float64Array.from(e, r => r.critical),
                glovesChance: a,
                glovesOverflow: i,
                glovesWear: l,
                helmetDamage: Float64Array.from(t, r => (n.criticalDamage + r.value) / 100),
                helmetWear: Float64Array.from(t, r => r.weight)
            }
        }
        attack(e, t, o) {
            const n = e.units[t];
            return (n.base + e.glovesOverflow[o]) * n.ammoFactor * this.model.militaryFactor
        }
        damagePerAttempt(e, t, o, n) {
            const a = this.attack(e, t, o)
              , i = e.glovesChance[o];
            return a * (1 - i) * .5 + a * i * (1 + e.unitCritical[t] * e.helmetDamage[n])
        }
        pairCost(e, t, o, n) {
            return t * (e.glovesWear[o] + e.helmetWear[n]) - this.model.lootPerPreciseAttempt * e.glovesChance[o]
        }
        buildUnion() {
            const e = this.pruned
              , t = e.units.length
              , o = e.helmets.length
              , n = e.gloves.length
              , a = o * n
              , i = new Float64Array(t)
              , l = new Float64Array(t)
              , r = (f, C) => {
                let b = 0;
                for (let x = 0; x < n; x++) {
                    const R = e.glovesChance[x];
                    for (let y = 0; y < t; y++) {
                        const D = this.attack(e, y, x);
                        i[y] = D * (1 - R) * .5,
                        l[y] = D * R
                    }
                    for (let y = 0; y < o; y++) {
                        const D = x * o + y
                          , M = b
                          , S = e.helmetDamage[y];
                        let A = -1
                          , w = Number.NaN;
                        for (let H = 0; H < t; H++) {
                            const I = i[H] + l[H] * (1 + e.unitCritical[H] * S);
                            I <= A || (b > M && w === e.unitCost[H] && b--,
                            f && (f[b] = I,
                            C[b] = H * a + D),
                            A = I,
                            w = e.unitCost[H],
                            b++)
                        }
                    }
                }
                return b
            }
              , c = r(null, null);
            let u = new Float64Array(c)
              , h = new Uint32Array(c);
            r(u, h);
            let g = new Float64Array(c)
              , d = new Uint32Array(c);
            const m = new Uint32Array(65536);
            for (let f = 0; f < 4; f++) {
                const C = new Uint32Array(u.buffer)
                  , b = f >> 1
                  , x = (f & 1) * 16;
                m.fill(0);
                for (let y = 0; y < c; y++)
                    m[C[y * 2 + b] >>> x & 65535]++;
                let R = 0;
                for (let y = 0; y < 65536; y++) {
                    const D = m[y];
                    m[y] = R,
                    R += D
                }
                for (let y = 0; y < c; y++) {
                    const D = m[C[y * 2 + b] >>> x & 65535]++;
                    g[D] = u[y],
                    d[D] = h[y]
                }
                [u,g] = [g, u],
                [h,d] = [d, h]
            }
            this.unionDpa = u,
            this.unionRec = h
        }
        staircase(e) {
            const t = this.staircases.get(e);
            if (t)
                return t;
            this.unionDpa || this.buildUnion();
            const o = this.pruned
              , n = o.helmets.length
              , a = n * o.gloves.length
              , i = new Float64Array(a);
            for (let f = 0; f < o.gloves.length; f++)
                for (let C = 0; C < n; C++)
                    i[f * n + C] = this.pairCost(o, e, f, C);
            const l = this.unionDpa
              , r = this.unionRec
              , c = []
              , u = []
              , h = [];
            let g = Number.POSITIVE_INFINITY;
            for (let f = l.length - 1; f >= 0; f--) {
                const C = r[f]
                  , b = o.unitCost[Math.floor(C / a)] + i[C % a];
                b >= g || (c.length && c[c.length - 1] === l[f] && (c.pop(),
                u.pop(),
                h.pop()),
                c.push(l[f]),
                u.push(b),
                h.push(C),
                g = b)
            }
            const d = c.length
              , m = {
                nonDodge: e,
                size: d,
                dpa: Float64Array.from({
                    length: d
                }, (f, C) => c[d - 1 - C]),
                cost: Float64Array.from({
                    length: d
                }, (f, C) => u[d - 1 - C]),
                rec: Uint32Array.from({
                    length: d
                }, (f, C) => h[d - 1 - C])
            };
            return this.staircases.set(e, m),
            m
        }
        releaseUnion() {
            this.unionDpa = null,
            this.unionRec = null
        }
        choice(e, t) {
            const o = this.pruned
              , n = o.helmets.length * o.gloves.length
              , a = e.rec[t]
              , i = a % n;
            return {
                unit: o.units[Math.floor(a / n)],
                gloves: o.gloves[Math.floor(i / o.helmets.length)],
                helmet: o.helmets[i % o.helmets.length],
                dpa: e.dpa[t],
                cost: e.cost[t]
            }
        }
        fullLists() {
            if (this.full)
                return this.full;
            const e = this.createLists(this.allUnits, this.model.helmets, this.model.gloves)
              , t = e.units.length
              , o = new Float64Array(e.gloves.length * t);
            for (let i = 0; i < e.gloves.length; i++) {
                let l = 0;
                for (let r = 0; r < t; r++)
                    l = Math.max(l, this.attack(e, r, i)),
                    o[i * t + r] = l
            }
            const n = new Float64Array(t);
            let a = 0;
            for (let i = 0; i < t; i++)
                n[i] = a = Math.max(a, e.unitCritical[i]);
            return this.full = {
                ...e,
                prefixAttack: o,
                prefixCritical: n
            },
            this.full
        }
        upperBound(e, t, o, n) {
            const a = e.glovesChance[t]
              , i = e.prefixAttack[t * e.units.length + n];
            return i * (1 - a) * .5 + i * a * (1 + e.prefixCritical[n] * e.helmetDamage[o])
        }
        windowMinimum(e, t, o, n) {
            const a = this.fullLists()
              , i = a.units.length
              , l = a.helmets.length
              , r = [];
            for (let h = 0; h < a.gloves.length; h++)
                for (let g = 0; g < l; g++) {
                    let d = 0
                      , m = i;
                    for (; d < m; ) {
                        const b = d + m >> 1;
                        this.upperBound(a, h, g, b) * (1 + 1e-12) < t ? d = b + 1 : m = b
                    }
                    if (d >= i)
                        continue;
                    const f = this.pairCost(a, e, h, g)
                      , C = a.unitCost[d] + f;
                    C < n && r.push([C, h, g, d, f])
                }
            r.sort( (h, g) => h[0] - g[0]);
            let c = null
              , u = n;
            for (const [h,g,d,m,f] of r) {
                if (h >= u)
                    break;
                for (let C = m; C < i; C++) {
                    const b = a.unitCost[C] + f;
                    if (b >= u)
                        break;
                    const x = this.damagePerAttempt(a, C, g, d);
                    if (!(x < t || x > o)) {
                        u = b,
                        c = {
                            unit: a.units[C],
                            gloves: a.gloves[g],
                            helmet: a.helmets[d],
                            dpa: x,
                            cost: b
                        };
                        break
                    }
                }
            }
            return c
        }
        windowMaximum(e, t, o) {
            const n = this.fullLists()
              , a = n.units.length
              , i = n.helmets.length
              , l = [];
            for (let c = 0; c < n.gloves.length; c++)
                for (let u = 0; u < i; u++) {
                    const h = this.pairCost(n, e, c, u);
                    let g = 0
                      , d = a;
                    for (; g < d; ) {
                        const m = g + d >> 1;
                        n.unitCost[m] + h <= o ? g = m + 1 : d = m
                    }
                    g && l.push([this.upperBound(n, c, u, g - 1), c, u, g, h])
                }
            l.sort( (c, u) => u[0] - c[0]);
            let r = null;
            for (const [c,u,h,g,d] of l) {
                if (r && c * (1 + 1e-12) < r.dpa)
                    break;
                for (let m = 0; m < g; m++) {
                    const f = this.damagePerAttempt(n, m, u, h);
                    if (f > t)
                        continue;
                    const C = n.unitCost[m] + d;
                    (!r || f > r.dpa || f === r.dpa && C < r.cost) && (r = {
                        unit: n.units[m],
                        gloves: n.gloves[u],
                        helmet: n.helmets[h],
                        dpa: f,
                        cost: C
                    })
                }
            }
            return r
        }
        forEachInWindow(e, t, o, n, a) {
            const i = this.fullLists();
            for (let l = 0; l < i.gloves.length; l++)
                for (let r = 0; r < i.helmets.length; r++) {
                    const c = this.pairCost(i, e, l, r);
                    for (let u = 0; u < i.units.length; u++) {
                        const h = i.unitCost[u] + c;
                        if (h > n)
                            break;
                        const g = this.damagePerAttempt(i, u, l, r);
                        g >= t && g <= o && a({
                            unit: i.units[u],
                            gloves: i.gloves[l],
                            helmet: i.helmets[r],
                            dpa: g,
                            cost: h
                        })
                    }
                }
        }
    }
    const Ft = 1e-12
      , _e = Number.POSITIVE_INFINITY;
    function le(s, e=1) {
        const t = globalThis.__wareraOptimizerStats;
        t && (t.counters[s] = (t.counters[s] ?? 0) + e)
    }
    function Ht(s, e, t) {
        let o = 0
          , n = e;
        for (; o < n; ) {
            const a = o + n >> 1;
            s[a] < t ? o = a + 1 : n = a
        }
        return o
    }
    function _o(s, e, t) {
        let o = 0
          , n = e;
        for (; o < n; ) {
            const a = o + n >> 1;
            s[a] <= t ? o = a + 1 : n = a
        }
        return o
    }
    const pe = s => s - Math.abs(s) * Ft - Number.MIN_VALUE
      , z = s => s + Math.abs(s) * Ft + Number.MIN_VALUE
      , T = (...s) => 1e-9 * Math.max(1, ...s.map(Math.abs))
      , Te = s => At.indexOf(s);
    function Xe(s, e) {
        return s.dailyNetCost - e.dailyNetCost || e.damagePerDay - s.damagePerDay || Rt(s.snapshot, e.snapshot) || Te(s.food) - Te(e.food)
    }
    function Lt(s, e) {
        return e.damagePerDay - s.damagePerDay || s.dailyNetCost - e.dailyNetCost || Rt(s.snapshot, e.snapshot) || Te(s.food) - Te(e.food)
    }
    class To {
        constructor(e) {
            P(this, "model");
            P(this, "offenseFrontier", null);
            P(this, "player", new Ze);
            P(this, "verifier");
            P(this, "builds", new Map);
            P(this, "ids", new WeakMap);
            P(this, "nextId", 1);
            this.setup = e,
            le("engineBuilds"),
            this.model = new Io(e),
            this.player.setPlayerLevel(e.player.getPlayerLevel()),
            this.player.setPlayerMilitaryRankAttackPercent(e.player.getPlayerMilitaryRankAttackPercent());
            for (const t of [...We, "lootChance"])
                this.player.setSkill(t, e.player.getSkill(t));
            this.verifier = new Je(this.player,e.sources,!0)
        }
        get infeasibleReason() {
            return this.model.infeasibleReason
        }
        get fallbackReason() {
            return this.model.fallbackReason
        }
        get offense() {
            if (!this.offenseFrontier) {
                this.offenseFrontier = new jo(this.model);
                for (const e of this.model.dodge)
                    this.offenseFrontier.staircase(e.nonDodge);
                this.offenseFrontier.releaseUnion()
            }
            return this.offenseFrontier
        }
        get optimizerFoods() {
            return this.model.foods.filter(e => Bo.includes(e.code))
        }
        foodsFor(e) {
            if (e == null)
                return this.optimizerFoods;
            const t = this.model.foods.find(o => o.code === e);
            return t ? [t] : null
        }
        id(e) {
            if (!e)
                return 0;
            let t = this.ids.get(e);
            return t == null && (t = this.nextId++,
            this.ids.set(e, t)),
            t
        }
        modelCost(e, t) {
            const o = Math.min(100, Math.max(0, this.model.precision + t.gloves.value)) / 100
              , n = t.unit.cost - this.model.lootPerPreciseAttempt * o
              , a = t.gloves.weight + t.helmet.weight;
            return {
                cost: e.costAttempts * n + e.costHits * a + e.costConstant,
                scale: e.costAttempts * (Math.abs(t.unit.cost) + this.model.lootPerPreciseAttempt) + e.costHits * (Math.abs(a) + Math.abs(e.armor.weight) + Math.abs(e.dodge.weight)) + Math.abs(e.costConstant)
            }
        }
        candidate(e, t, o, n) {
            const {cost: a, scale: i} = this.modelCost(e, t);
            return {
                config: e,
                choice: t,
                damage: this.model.targetDamage(e, t.dpa),
                cost: a,
                scale: i,
                staircase: o,
                index: n
            }
        }
        fromStaircase(e, t, o) {
            return this.candidate(e, this.offense.choice(t, o), t, o)
        }
        verify(e) {
            var u, h, g;
            const {config: t, choice: o} = e
              , n = [t.food.code, t.armor.chest.item, t.armor.pants.item, t.dodge.boots.item, o.unit.weapon.item, ((u = o.unit.ammo) == null ? void 0 : u.item) ?? null, o.helmet.item, o.gloves.item].map(d => typeof d == "string" ? d : this.id(d)).join("|");
            if (this.builds.has(n))
                return this.builds.get(n);
            le("verifications");
            const a = {
                weapon: o.unit.weapon.item,
                ammo: ((h = o.unit.ammo) == null ? void 0 : h.item) ?? null,
                helmet: o.helmet.item,
                chest: t.armor.chest.item,
                pants: t.armor.pants.item,
                boots: t.dodge.boots.item,
                gloves: o.gloves.item
            }
              , i = this.setup.options;
            this.player.setFood(t.food.code);
            for (const d of ie)
                this.player.setEquipment(d, a[d]);
            const l = this.verifier.getObjectivePoint(this.player, i)
              , r = l ? this.verifier.getBudgetCost(this.player, i) : null;
            let c = null;
            return l && r != null && (c = {
                food: t.food.code,
                equipment: a,
                snapshot: Ro(this.player),
                damagePerDay: l.damagePerDay,
                dailyNetCost: l.dailyNetCost,
                budgetCost: r,
                displayedDamage: i.dailyContext ? ((g = this.verifier.getDisplayedDailyPoint(this.player, i)) == null ? void 0 : g.damagePerDay) ?? l.damagePerDay : l.damagePerDay,
                ...i.round ? {
                    roundNetCost: l.roundNetCost ?? null
                } : {}
            }),
            this.builds.set(n, c),
            c
        }
        spending(e) {
            this.player.setFood(e.food);
            for (const t of ie)
                this.player.setEquipment(t, e.equipment[t]);
            return this.verifier.getDisplayedDailySpending(this.player, this.setup.options)
        }
        fixedDamage(e) {
            return this.model.targetDamage(e, 0)
        }
        minCost(e, t, o, n) {
            le("queries");
            const a = []
              , i = [];
            for (const c of n)
                for (const u of this.model.getConfigs(c)) {
                    const h = this.offense.staircase(u.nonDodge);
                    if (!h.size)
                        continue;
                    const g = this.fixedDamage(u);
                    let d = 0;
                    if (u.targetSlope > 0) {
                        const f = (e - g) / u.targetSlope;
                        f > 0 && (d = Ht(h.dpa, h.size, pe(f)))
                    } else if (g < pe(e))
                        continue;
                    if (d >= h.size)
                        continue;
                    const m = this.fromStaircase(u, h, d);
                    m.cost + u.budgetOffset > o + T(o, m.scale) || (m.damage > z(t) ? i.push({
                        config: u,
                        bound: m.cost
                    }) : a.push(m))
                }
            let l = null;
            const r = c => !c || c.damagePerDay < e || c.damagePerDay > t || c.budgetCost > o ? !1 : ((!l || Xe(c, l) < 0) && (l = c),
            !0);
            a.sort( (c, u) => c.cost - u.cost || u.damage - c.damage);
            for (let c = 0; c < a.length; c++) {
                const u = a[c];
                if (l && u.cost > l.dailyNetCost + T(l.dailyNetCost, u.scale))
                    break;
                const h = this.verify(u);
                if (!(r(h) || !h))
                    if (h.damagePerDay < e && u.staircase && u.index + 1 < u.staircase.size) {
                        const g = this.fromStaircase(u.config, u.staircase, u.index + 1);
                        let d = c + 1;
                        for (; d < a.length && a[d].cost <= g.cost; )
                            d++;
                        a.splice(d, 0, g)
                    } else
                        h.damagePerDay > t && i.push({
                            config: u.config,
                            bound: u.cost
                        })
            }
            i.sort( (c, u) => c.bound - u.bound);
            for (const {config: c, bound: u} of i) {
                const h = l;
                if (h && u > h.dailyNetCost + T(h.dailyNetCost, u))
                    break;
                if (c.targetSlope <= 0 || c.costAttempts <= 0)
                    continue;
                le("windowQueries");
                const g = this.fixedDamage(c)
                  , d = h ? h.dailyNetCost : o - c.budgetOffset
                  , m = z((d - c.costConstant) / c.costAttempts) + T(d, c.costConstant) / c.costAttempts
                  , f = this.offense.windowMinimum(c.nonDodge, pe((e - g) / c.targetSlope), z((t - g) / c.targetSlope), m);
                f && r(this.verify(this.candidate(c, f)))
            }
            return l
        }
        maxDamage(e, t, o) {
            le("queries");
            const n = []
              , a = [];
            for (const r of o)
                for (const c of this.model.getConfigs(r)) {
                    const u = this.offense.staircase(c.nonDodge);
                    if (!u.size)
                        continue;
                    let h;
                    if (c.costAttempts > 0) {
                        const d = (e - c.budgetOffset - c.costConstant) / c.costAttempts;
                        h = _o(u.cost, u.size, z(d) + T(e, c.costConstant) / c.costAttempts) - 1
                    } else
                        h = c.costConstant + c.budgetOffset <= e + T(e) ? u.size - 1 : -1;
                    if (h < 0)
                        continue;
                    const g = this.fromStaircase(c, u, h);
                    g.damage > z(t) ? a.push(c) : n.push(g)
                }
            let i = null;
            const l = r => !r || r.damagePerDay > t || r.budgetCost > e ? !1 : ((!i || Lt(r, i) < 0) && (i = r),
            !0);
            n.sort( (r, c) => c.damage - r.damage || r.cost - c.cost);
            for (let r = 0; r < n.length; r++) {
                const c = n[r];
                if (i && c.damage < i.damagePerDay - T(i.damagePerDay))
                    break;
                const u = this.verify(c);
                if (!(l(u) || !u))
                    if (u.budgetCost > e && c.staircase && c.index > 0) {
                        const h = this.fromStaircase(c.config, c.staircase, c.index - 1);
                        let g = r + 1;
                        for (; g < n.length && n[g].damage >= h.damage; )
                            g++;
                        n.splice(g, 0, h)
                    } else
                        u.damagePerDay > t && a.push(c.config)
            }
            for (const r of a) {
                const c = i;
                if (c && c.damagePerDay >= t - T(t))
                    break;
                if (r.targetSlope <= 0 || r.costAttempts <= 0)
                    continue;
                le("windowQueries");
                const u = z((e - r.budgetOffset - r.costConstant) / r.costAttempts) + T(e, r.costConstant) / r.costAttempts
                  , h = this.offense.windowMaximum(r.nonDodge, z((t - this.fixedDamage(r)) / r.targetSlope), u);
                h && l(this.verify(this.candidate(r, h)))
            }
            return i
        }
        valueUpgrade(e, t, o, n, a) {
            if (!this.setup.options.dailyContext)
                return null;
            const i = this.spending(e);
            if (i == null || !(i > 0) || !(e.displayedDamage > 0))
                return null;
            const l = e.dailyNetCost + .01 * i
              , r = (d, m, f) => (d - e.displayedDamage) / e.displayedDamage > (m - e.dailyNetCost) / i - f
              , c = []
              , u = [];
            for (const d of a)
                for (const m of this.model.getConfigs(d)) {
                    const f = this.offense.staircase(m.nonDodge)
                      , C = this.fixedDamage(m);
                    let b = 0;
                    if (m.targetSlope > 0) {
                        const x = (t - C) / m.targetSlope;
                        x > 0 && (b = Ht(f.dpa, f.size, pe(x)))
                    } else if (C < pe(t))
                        continue;
                    for (; b < f.size; b++) {
                        const x = this.fromStaircase(m, f, b)
                          , R = T(l, x.scale);
                        if (x.cost > l + R || x.cost + m.budgetOffset > n + R)
                            break;
                        if (x.damage > z(o)) {
                            u.push(m);
                            break
                        }
                        r(this.model.displayedDamage(m, x.choice.dpa), x.cost, 1e-9) && c.push(x)
                    }
                }
            for (const d of u) {
                if (d.targetSlope <= 0 || d.costAttempts <= 0)
                    continue;
                le("windowQueries");
                const m = this.fixedDamage(d)
                  , f = z((Math.min(l, n - d.budgetOffset) - d.costConstant) / d.costAttempts) + T(l, d.costConstant) / d.costAttempts;
                this.offense.forEachInWindow(d.nonDodge, pe((t - m) / d.targetSlope), z((o - m) / d.targetSlope), f, C => {
                    const b = this.candidate(d, C);
                    r(this.model.displayedDamage(d, C.dpa), b.cost, 1e-9) && c.push(b)
                }
                )
            }
            const h = d => this.model.displayedDamage(d.config, d.choice.dpa);
            c.sort( (d, m) => h(m) - h(d) || d.cost - m.cost);
            let g = null;
            for (const d of c) {
                const m = g;
                if (m && h(d) < m.displayedDamage - T(m.displayedDamage))
                    break;
                const f = this.verify(d);
                !f || f.damagePerDay < t || f.damagePerDay > o || f.budgetCost > n || f.dailyNetCost > l || !r(f.displayedDamage, f.dailyNetCost, 0) || (!m || f.displayedDamage > m.displayedDamage || f.displayedDamage === m.displayedDamage && Xe(f, m) < 0) && (g = f)
            }
            return g
        }
        selectForTarget(e, t, o, n=_e, a=!1) {
            const i = this.minCost(e, n, t, o);
            if (!i) {
                const r = this.maxDamage(t, n, o);
                return r ? {
                    build: r,
                    reachedTarget: !1
                } : null
            }
            return {
                build: (a ? this.valueUpgrade(i, e, n, t, o) : null) ?? i,
                reachedTarget: !0
            }
        }
        strongestWithinBudget(e, t) {
            return this.maxDamage(e, _e, t)
        }
        graph(e, t) {
            const o = Ao(e)
              , n = []
              , a = o.map( () => ({
                reached: null,
                strongest: null
            }));
            for (const l of this.optimizerFoods) {
                let r;
                o.forEach( (c, u) => {
                    let h = this.minCost(c, _e, t, [l]);
                    const g = !!h;
                    if (h || (h = r === void 0 ? r = this.maxDamage(t, _e, [l]) : r),
                    !h)
                        return;
                    n.push(Uo(h));
                    const d = a[u];
                    g ? (!d.reached || Xe(h, d.reached) < 0) && (d.reached = h) : (!d.strongest || Lt(h, d.strongest) < 0) && (d.strongest = h)
                }
                )
            }
            const i = a.flatMap( ({reached: l, strongest: r}) => {
                const c = l ?? r;
                return c ? [Bt(c)] : []
            }
            );
            return {
                foodPoints: n,
                aggregate: i
            }
        }
    }
    function Bt(s) {
        return {
            damagePerDay: s.damagePerDay,
            dailyNetCost: s.dailyNetCost,
            ...s.roundNetCost !== void 0 ? {
                roundNetCost: s.roundNetCost
            } : {}
        }
    }
    function Uo(s) {
        const e = {
            ...Bt(s),
            foodCode: s.food,
            equipment: s.snapshot
        };
        return Object.defineProperty(e, "build", {
            value: s,
            enumerable: !1
        })
    }
    function Vo(s, e) {
        for (const t of [...We, "lootChance"])
            s.setSkill(t, e[t] ?? 0)
    }
    function Go(s, e, t) {
        const o = {};
        if (!s)
            return o;
        for (const n of ie) {
            if (!(n in s))
                continue;
            const a = s[n] ?? null;
            if (a == null) {
                o[n] = null;
                continue
            }
            if (typeof a == "string") {
                o[n] = new V(e,a,{},t);
                continue
            }
            if (!a.code) {
                o[n] = null;
                continue
            }
            o[n] = new V(e,a.code,a.skills ?? {},t)
        }
        return o
    }
    function Ot(s) {
        const e = new Ze;
        return e.setPlayerLevel(s.level),
        e.setPlayerMilitaryRankAttackPercent(s.militaryRankPercent),
        Vo(e, s.fightSkills),
        e
    }
    function It(s) {
        return {
            getGameConfigItems: () => s.gameConfigItems,
            getGameConfigSkills: () => s.gameConfigSkills,
            getGameConfigBattle: () => s.gameConfigBattle,
            getItemPrices: () => s.itemPrices,
            getEquipmentPrices: () => s.equipmentPrices,
            getEquipmentMarketRolls: () => s.equipmentMarketRolls,
            getCombatSkills: () => s.combatSkills
        }
    }
    const fe = new Map;
    let zo = 1;
    function Ko(s, e, t={}) {
        if (yo(e.equipment, s.gameConfigItems))
            return [];
        const o = {
            ...s,
            lockedEquipment: void 0,
            lockedFood: void 0,
            fixedNetCostPerDay: void 0,
            combatOptions: {
                ...s.combatOptions,
                round: void 0
            }
        }
          , n = JSON.stringify(o);
        let a = fe.get(n);
        if (a)
            fe.delete(n);
        else {
            const u = Ot(o)
              , h = It(o);
            a = new To({
                sources: h,
                player: u,
                helper: new Je(u,h,!0),
                options: o.combatOptions,
                locks: {}
            })
        }
        for (fe.set(n, a); fe.size > zo; )
            fe.delete(fe.keys().next().value);
        const i = a.optimizerFoods;
        if (a.fallbackReason || a.infeasibleReason || !i.length)
            return [];
        const l = $o({
            ...o,
            equipmentPrices: {
                ...o.equipmentPrices,
                ...t
            }
        }, e);
        if (!l)
            return [];
        const r = a.minCost(l.damagePerDay, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, i)
          , c = a.strongestWithinBudget(l.budgetCost, i);
        return [r, c].flatMap(u => u ? [{
            damagePerDay: u.displayedDamage,
            dailyNetCost: u.dailyNetCost,
            foodCode: u.food,
            equipment: u.snapshot
        }] : [])
    }
    function $o(s, e) {
        const t = It(s)
          , o = Ot(s);
        o.setFood(e.foodCode);
        const n = Go(e.equipment, s.gameConfigItems, t);
        for (const r of ie)
            o.setEquipment(r, n[r] ?? null);
        const a = new Je(o,t)
          , i = a.getObjectivePoint(o, s.combatOptions)
          , l = i ? a.getBudgetCost(o, s.combatOptions) : null;
        return i && l != null ? {
            damagePerDay: i.damagePerDay,
            budgetCost: l
        } : null
    }
    const et = self;
    et.onmessage = ({data: s}) => {
        try {
            et.postMessage({
                id: s.id,
                points: Ko(s.input, s.build, s.prices)
            })
        } catch (e) {
            et.postMessage({
                id: s.id,
                error: e instanceof Error ? e.message : "Background search failed."
            })
        }
    }
}
)();
