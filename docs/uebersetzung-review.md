# Übersetzungs-Review vor dem Launch

Die fünf Sprachen (ES, FR, DE, JA, ZH-CN) sind maschinell übersetzt (E10-P2) und bleiben unsichtbar, bis `locales/.meta.json` für die Sprache `reviewed: true` trägt. Freigeben heißt: Ein Muttersprachler hat die Datei gelesen, die Punkte unten sind entschieden, `npm run i18n:check` ist grün, dann `reviewed` auf `true`.

## Offene Punkte aus der Prüfung (2026-11-27)

**Begriffe**
- ES `volcado` und ZH-CN `倾倒` für *Dump* klingen als Seitentitel ungewohnt.
- FR `courses` für *Errands* deckt Besorgungen ab, Behördengänge nicht.
- ZH-CN `杂事` oder `跑腿` für *Errands*.
- JA ウィークリーリセット oder 週次レビュー für *Weekly reset*.
- ES `esencial` und FR `prioritaire` für *Must* weichen vom Gedanken „muss heute“ ab.
- DE lässt *Weekly Reset*, *Dump*, *Habit* und *Do Date* englisch; die anderen Sprachen übersetzen *Do Date*.

**Formulierungen**
- JA `today.energy.good` „いいエネルギーがあります“ ist zu wörtlich, natürlicher wäre etwa „今日は調子がよさそうです“.
- JA `ritual.energy.question` nutzt die Metapher 電池, und `ritual.progressLabel` „朝の儀式“ wirkt schwer.
- ZH-CN `ritual.start.notNow` „现在不“ ist zu knapp, besser „暂时不“ oder „先不了“.
- ZH-CN `today.energy.low`: Für „Energie“ ist 精力 üblicher als 能量.

Die vollständigen Glossare je Sprache stehen im dsh-Bericht in Issue #76.
