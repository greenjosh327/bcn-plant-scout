import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
const ORIGIN = process.env.EXPO_PUBLIC_SCOUT_CHALLENGE_ORIGIN ?? "https://basecampnorthpa.com";
type Status = { open: boolean; week?: { id: number; label: string }; savedPlants?: number; preferences?: { opted_out: boolean }; entry?: { status: string; method: string } | null };
export function WeeklyChallenge({ client }: { client: SupabaseClient | null }) {
  const [status, setStatus] = useState<Status | null>(null); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const [name, setName] = useState(""); const [state, setState] = useState(""); const [age, setAge] = useState(false); const [consent, setConsent] = useState(false);
  const request = useCallback(async (options: RequestInit = {}, path = "") => {
    if (!/^https:\/\//.test(ORIGIN)) throw new Error("Giveaway information is unavailable.");
    const session = await client?.auth.getSession();
    const response = await fetch(`${ORIGIN}/api/challenge${path}`, { ...options, headers: { ...options.headers, ...(session?.data.session ? { Authorization: `Bearer ${session.data.session.access_token}` } : {}) } });
    const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Please try again."); return result as Status & { message?: string };
  }, [client]);
  const refresh = useCallback(async () => { try { setStatus(await request()); } catch { setStatus({ open: false }); } }, [request]);
  useEffect(() => { void refresh(); }, [refresh]);
  async function preferences(optedOut: boolean, details = false) {
    if (busy) return; setBusy(true);
    try { const result = await request({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preferences", optedOut, ...(details ? { name, state, ageConfirmed: age, consent } : {}) }) }, "/app"); setMessage(result.message ?? "Preferences saved."); await refresh(); }
    catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  const count = status?.savedPlants ?? 0; const optedOut = status?.preferences?.opted_out ?? false;
  return <View style={styles.panel}>
    <Text style={styles.title}>Weekly Seed Giveaway</Text><Text>Save 10 plants this week for a chance to win 3 free seed packs from Base Camp North!</Text>
    {!status?.open ? <><Text style={styles.emphasis}>Coming Soon!</Text><Text>Our Weekly Seed Giveaway is almost here. Save plants, explore nature, and get ready to win free seeds!</Text><Text>Entries and drawings are not open yet.</Text></> : <>
      <Text>Week {status.week?.id}: {status.week?.label}</Text><Text style={styles.emphasis}>You’ve saved {count} of 10 plants this week!</Text>
      <Text>{optedOut ? "Automatic participation is OFF." : count >= 10 ? "Automatically qualified. Eligibility review applies; no entry button required." : `Save ${10 - count} more plants to qualify for this week’s drawing.`}</Text>
      {status.entry ? <Text>Entry method: {status.entry.method}. Status: {status.entry.status}.</Text> : null}
      <Text>No different-species requirement. Multiple photos on one record count once. New records must sync within the week.</Text>
      <View style={styles.row}><Text>Opt out of automatic app participation</Text><Switch accessibilityLabel="Opt out of giveaway" value={optedOut} disabled={busy} onValueChange={value => void preferences(value)} /></View>
      {!optedOut ? <><Text>Confirm eligibility details (not an entry submission)</Text><TextInput accessibilityLabel="Full name" placeholder="Full name" value={name} onChangeText={setName} maxLength={100} style={styles.input} /><TextInput accessibilityLabel="State" placeholder="State code or DC" value={state} onChangeText={setState} maxLength={2} autoCapitalize="characters" style={styles.input} /><View style={styles.row}><Text>I am 18+ and reside in the 50 states or D.C.</Text><Switch accessibilityLabel="Age and residence confirmation" value={age} onValueChange={setAge} /></View><View style={styles.row}><Text>I acknowledge the giveaway rules and privacy notice.</Text><Switch accessibilityLabel="Rules and privacy acknowledgment" value={consent} onValueChange={setConsent} /></View><Pressable accessibilityRole="button" disabled={busy || !age || !consent} onPress={() => void preferences(false, true)} style={styles.button}><Text>Save eligibility details</Text></Pressable></> : null}
    </>}
    <Pressable accessibilityRole="link" style={styles.button} onPress={() => { void Linking.openURL(`${ORIGIN}/plant-scout-challenge`).catch(() => setMessage("Visit basecampnorthpa.com/plant-scout-challenge.")); }}><Text>{status?.open ? "View Contest Details" : "Learn More"}</Text></Pressable>
    <Text>No purchase necessary. Free website entry is available without the app. No automatic marketing signup.</Text><Text accessibilityLiveRegion="polite">{message}</Text>
  </View>;
}
const styles = StyleSheet.create({ panel: { padding: 18, gap: 12, backgroundColor: "#e7efdf", borderRadius: 14, marginBottom: 16 }, title: { fontSize: 22, fontWeight: "700", color: "#244b39" }, emphasis: { fontWeight: "700", color: "#244b39" }, row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }, input: { borderWidth: 1, borderColor: "#789281", padding: 12, borderRadius: 8 }, button: { padding: 14, backgroundColor: "#fff", borderRadius: 8 } });
