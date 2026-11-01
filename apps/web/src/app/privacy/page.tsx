import type { Metadata } from "next";
import { LegalPage } from "../legal";

export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy" updated="28 October 2026">
      <p>This page explains what Sieveline stores, why, and who else sees it.</p>
      <h2>What we store</h2>
      <ul>
        <li>Your account: name, email, a hash of your password (Argon2id; we can&apos;t read it), and two-factor settings if you turn them on.</li>
        <li>Your work: the lists you describe, the companies and evidence found, your reviews, notes and Advisor chats.</li>
        <li>Usage records: how many research credits each list used, and an audit log of important actions in your workspace.</li>
        <li>Security records: sign-in sessions with browser type, and rate-limit counters keyed by IP address.</li>
      </ul>
      <h2>Who processes it</h2>
      <ul>
        <li><strong>Tavily</strong> receives the search queries and website addresses needed to research companies. It does not receive your name or email.</li>
        <li><strong>The language model provider</strong> receives company website text and your list&apos;s rules to answer them, and Advisor questions with the evidence. During early access this is OVHcloud AI Endpoints.</li>
        <li><strong>Neon</strong> (database) and <strong>Vercel</strong> (hosting) store and serve the app. <strong>Resend</strong> sends account emails.</li>
      </ul>
      <h2>Separation between customers</h2>
      <p>Each workspace&apos;s data is separated by the database itself (row-level security). Sieveline staff can open the admin panel only with two-factor authentication, and every staff action is recorded in the audit log.</p>
      <h2>Demo accounts</h2>
      <p>One-click demo accounts and everything in them are deleted automatically after 24 hours.</p>
      <h2>Your choices</h2>
      <p>You can ask for a copy of your data or for your account to be deleted by emailing the address on this site. We aim to answer within 30 days.</p>
    </LegalPage>
  );
}
