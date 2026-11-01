import type { Metadata } from "next";
import { LegalPage } from "../legal";

export const metadata: Metadata = { title: "Terms" };

export default function Terms() {
  return (
    <LegalPage title="Terms" updated="28 October 2026">
      <p>Sieveline is in early access. By using it you agree to the following.</p>
      <h2>What Sieveline is</h2>
      <p>A research tool that finds companies on the public web and checks them against rules you set. It is not investment, legal or financial advice. Verify anything important yourself before acting on it, especially deep-dive reports, which are written by a research agent and are not quote-checked.</p>
      <h2>Fair use</h2>
      <ul>
        <li>Each workspace has a monthly research allowance. We may pause research that looks like abuse or that threatens the service for others.</li>
        <li>Don&apos;t use Sieveline to harass anyone, to send unsolicited bulk messages, or to build a competing data product from its output.</li>
        <li>Don&apos;t try to access other customers&apos; data or to disrupt the service.</li>
      </ul>
      <h2>Your content</h2>
      <p>Your lists, notes and chats are yours. We use them only to run the service for you.</p>
      <h2>Availability</h2>
      <p>Early access is provided as is, without guarantees of availability or accuracy. Features and limits may change.</p>
    </LegalPage>
  );
}
