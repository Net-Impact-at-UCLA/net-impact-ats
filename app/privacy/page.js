export const metadata = { title: 'Privacy · Net Impact ATS' };

export default function PrivacyPage() {
  return (
    <main className="page narrow">
      <h1>Privacy policy</h1>
      <p className="prose">
        Net Impact ATS is an internal recruitment tool for Net Impact at UCLA, a student
        organization. It is used only by club members on the organization&apos;s roster.
      </p>
      <h2>What we collect</h2>
      <p className="prose">
        When you sign in with Google, we receive your name and email address to confirm you are on
        the member roster. The app also stores information applicants submitted through the club&apos;s
        application form, along with members&apos; scores, notes, and votes.
      </p>
      <h2>How it&apos;s used</h2>
      <p className="prose">
        This information is used only to run the club&apos;s recruitment process. It is never sold or
        shared outside the organization. Contact details and any extenuating circumstances an
        applicant shares are visible only to a small group of exec board admins.
      </p>
      <h2>Questions or removal requests</h2>
      <p className="prose">
        Email <a href="mailto:netimpactatucla@gmail.com">netimpactatucla@gmail.com</a> to ask about
        your data or request that it be deleted.
      </p>
    </main>
  );
}
