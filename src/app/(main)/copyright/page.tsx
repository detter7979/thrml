import type { Metadata } from "next"

export const revalidate = 3600

export const metadata: Metadata = {
  title: "Copyright and DMCA Policy",
  description:
    "How to report copyright infringement on thrml, and the contact details of thrml's designated DMCA agent.",
  alternates: { canonical: "https://usethrml.com/copyright" },
}

// Must match the designation on file with the U.S. Copyright Office's DMCA Designated Agent
// Directory (registered November 11, 2026). Update both together.
const DMCA_AGENT = {
  name: "Copyright Agent",
  organization: "THRML LLC",
  street: "100 N Howard St, Ste R",
  cityStateZip: "Spokane, WA 99201",
  phone: "(443) 810-4836",
  phoneHref: "tel:+14438104836",
  email: "hello@usethrml.com",
}

const sectionHeading = "mt-10 font-serif text-2xl text-[#1A1410]"
const body = "mt-3 text-sm leading-relaxed text-[#2F241E]"
const list = "mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-[#2F241E]"

export default function CopyrightPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12 text-[#1A1410] md:px-8">
      <h1 className="font-serif text-4xl">Copyright and DMCA Policy</h1>
      <p className="mt-2 text-sm text-[#5F5148]">thrml Wellness Marketplace - usethrml.com</p>
      <p className="mt-1 text-sm text-[#5F5148]">Effective Date: November 2026</p>

      <p className="mt-8 text-sm leading-relaxed text-[#2F241E]">
        THRML LLC (&quot;thrml&quot;) respects the intellectual property rights of others and expects Hosts and
        Guests to do the same. We respond to notices of alleged copyright infringement that comply with the
        Digital Millennium Copyright Act (17 U.S.C. &sect; 512).
      </p>

      <h2 className={sectionHeading}>Designated Copyright Agent</h2>
      <address className="mt-3 text-sm not-italic leading-relaxed text-[#2F241E]">
        {DMCA_AGENT.name}, {DMCA_AGENT.organization}
        <br />
        {DMCA_AGENT.street}
        <br />
        {DMCA_AGENT.cityStateZip}
        <br />
        Phone:{" "}
        <a href={DMCA_AGENT.phoneHref} className="underline underline-offset-2">
          {DMCA_AGENT.phone}
        </a>
        <br />
        Email:{" "}
        <a href={`mailto:${DMCA_AGENT.email}`} className="underline underline-offset-2">
          {DMCA_AGENT.email}
        </a>
      </address>

      <h2 className={sectionHeading}>Submitting a takedown notice</h2>
      <p className={body}>
        If you believe content on thrml, such as a listing photo or description, infringes your copyright, send
        our Copyright Agent a written notice that includes:
      </p>
      <ol className={list}>
        <li>Your physical or electronic signature.</li>
        <li>Identification of the copyrighted work you claim is infringed.</li>
        <li>
          Identification of the material on thrml you want removed, with enough detail for us to locate it (for
          example, the listing URL).
        </li>
        <li>Your name, mailing address, phone number and email address.</li>
        <li>
          A statement that you have a good-faith belief that the use is not authorized by the copyright owner, its
          agent or the law.
        </li>
        <li>
          A statement, under penalty of perjury, that the information in your notice is accurate and that you are
          the copyright owner or authorized to act on the owner&apos;s behalf.
        </li>
      </ol>
      <p className={body}>
        When we receive a valid notice, we will remove or disable access to the material and notify the user who
        posted it.
      </p>

      <h2 className={sectionHeading}>Submitting a counter-notice</h2>
      <p className={body}>
        If your content was removed and you believe this was a mistake or misidentification, you may send our
        Copyright Agent a counter-notice that includes:
      </p>
      <ol className={list}>
        <li>Your physical or electronic signature.</li>
        <li>Identification of the material that was removed and where it appeared before removal.</li>
        <li>
          A statement, under penalty of perjury, that you have a good-faith belief the material was removed by
          mistake or misidentification.
        </li>
        <li>
          Your name, address and phone number, and a statement that you consent to the jurisdiction of the federal
          district court for your address (or, if you are outside the United States, any judicial district in which
          thrml may be found), and that you will accept service of process from the person who submitted the
          original notice.
        </li>
      </ol>
      <p className={body}>
        If we receive a valid counter-notice, we may restore the material in 10 to 14 business days unless the
        person who submitted the original notice tells us they have filed a court action.
      </p>

      <h2 className={sectionHeading}>Repeat infringers</h2>
      <p className={body}>
        thrml will, in appropriate circumstances, suspend or terminate the accounts of users who repeatedly infringe
        the copyrights of others.
      </p>
      <p className={body}>
        Misrepresenting that material is infringing, or that it was removed by mistake, may result in liability for
        damages under 17 U.S.C. &sect; 512(f).
      </p>
    </main>
  )
}
