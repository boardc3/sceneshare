import { useI18n } from '../i18n.js'
import { LEGAL } from '../legal/entity.js'
import { Link } from '../router.jsx'

// Terms of Service, Privacy Policy and Cookie Notice. The English text governs;
// Chinese readers get a plain-language summary above it.
const { operator, service, contactEmail, effective } = LEGAL
const Mail = () => <a href={`mailto:${contactEmail}`}>{contactEmail}</a>

function Terms() {
  return (
    <>
      <p>
        These Terms of Service (“Terms”) are an agreement between you and {operator} (“{service},” “we,” “us”) about your use of the {service} website and
        services (the “Service”). By creating an account or using the Service you agree to these Terms and to our <Link to="/privacy">Privacy Policy</Link>. If
        you do not agree, do not use the Service.
      </p>

      <h2>1. Who may use Sceneshare</h2>
      <p>
        You must be at least 18 years old and able to form a binding contract. If you use the Service for a business (for example a brokerage), you agree to
        these Terms on its behalf and confirm you are authorized to do so.
      </p>

      <h2>2. What the Service does</h2>
      <p>
        {service} lets a property owner, or someone the owner has authorized, look up a home by address, gather its photographs (listing photographs and photos you
        take yourself), create digitally altered “designs” of those photographs with an artificial-intelligence image model (restyling finishes, furniture,
        lighting and landscaping, or relighting and finishing the photo), and share a web page about the home with prospective buyers. Viewing a shared page does not
        require an account.
      </p>

      <h2>3. Accounts</h2>
      <ul>
        <li>Searching for a home, adding photos and creating designs require an account. You can sign up with an email address and password or with Google.</li>
        <li>Give accurate information, keep your password confidential, and tell us promptly at <Mail /> if you believe your account has been used without permission. You are responsible for activity under your account.</li>
        <li>Each home you search or start is saved to your account. Only your account can change it.</li>
        <li>You can delete any home, or your whole account and its data, at any time from <Link to="/account">My homes</Link>.</li>
      </ul>

      <h2>4. Your content and photographs</h2>
      <p>
        “Your Content” means photographs you upload or capture, photographs we retrieve at your direction (for example listing photographs from public listing
        pages for the address you entered), notes and change requests you type, and the images the Service generates for you.
      </p>
      <ul>
        <li>
          <strong>Your rights.</strong> You keep whatever rights you have in Your Content. You confirm that you own the home or are authorized by its owner, and that
          you have the right (as owner, as listing agent, or with permission from the photographer and broker) to use, alter and share every photograph you add or
          direct us to retrieve. Listing photographs remain the property of their photographers and brokers; the Service credits their source on every image.
        </li>
        <li>
          <strong>License to us.</strong> You grant {operator} a non-exclusive, worldwide, royalty-free license to host, copy, process, transmit, display and create
          derivative images from Your Content solely to provide, secure and improve the Service for you and the people you share it with. This license ends when you
          delete the content or your account, except for copies already shared by you and backups kept for a limited time as described in the Privacy Policy.
        </li>
        <li>
          <strong>Image model.</strong> To generate a design, the photograph and your instructions are sent to Google’s Gemini image model, which returns a new image.
          We do not use Your Content to train any model.
        </li>
        <li>
          <strong>Copyright complaints.</strong> If you believe content on the Service infringes your copyright, email <Mail /> with the work, the page address,
          your contact details and a statement under penalty of perjury that you are the owner or authorized to act for the owner. We will remove infringing
          material and may close accounts of repeat infringers.
        </li>
      </ul>

      <h2>5. Digitally altered images and real-estate advertising</h2>
      <ul>
        <li>
          Designs are conceptual renderings: digitally altered images that change finishes, furniture, fixtures, lighting, landscaping or other elements. They are not
          photographs of existing conditions and are not a representation, warranty or appraisal of the property. The Service instructs the model to keep the camera,
          room dimensions, walls, windows, ceiling and views as photographed, but generated images can still contain errors.
        </li>
        <li>
          {service} buyer pages label altered images and always show the original photograph alongside them. If you are a California real estate licensee, or act on
          behalf of one, and you use an altered image in an advertisement or other promotional material, you are responsible for complying with California Business
          and Professions Code §10140.8 (AB 723) — including a conspicuous statement that the image has been altered and access to the unaltered image — and with all
          other advertising, licensing and fair-housing laws.
        </li>
        <li>Do not use the Service to misrepresent a property’s condition, size, location, views or features.</li>
      </ul>

      <h2>6. Maps, parcels, listing facts and nearby places</h2>
      <p>
        Maps, geocoded locations, assessor parcel outlines, listing facts and nearby-place information come from third parties (including Mapbox, county assessors,
        and public listing pages). They are approximate, may be out of date, and are not a survey, title report, legal boundary description, school-assignment
        determination or professional advice. Buyers and sellers should verify everything independently.
      </p>

      <h2 id="sharing">7. Sharing and link tracking</h2>
      <p>
        <strong>Your right to share.</strong> Before you share any home, you must confirm, once for your account, that you own each home you share or have
        the owner’s permission, and that you have the rights and/or permission to share its address, photographs, designs and other information with the
        people you send it to. You make this confirmation and accept these Terms in the Service before your first share; it then covers every home you
        share. We record the date and time, the version of these Terms you accepted, your account, and a hashed form of your IP address and your browser
        type. If these Terms change materially, we may ask you to confirm again.
      </p>
      <p>
        <strong>Before you confirm.</strong> Until you have confirmed, the homes you share are not shown to anyone else. A person who opens your link sees
        only that the home is not visible yet, with your name and email address so they can ask you to confirm, and a button that sends you that request by
        email. We store each such request (the home, the time, the requester’s email address if they choose to give it, and a hashed IP address) and send
        you at most one request email per home per hour.
      </p>
      <p>
        Anyone who has a home’s share link can view its page, including its address, photographs, designs and map. Buyer pages are marked so search engines do not
        index them, but links can be forwarded. Share links only with people you intend to see the home, and delete the home if you no longer want the page
        available.
      </p>
      <ul>
        <li>
          <strong>Tracked links.</strong> Each time you share a home (by email, text, copied link or your device’s share sheet) the Service creates a unique link
          and records the share: when, how, and — for email — the recipient addresses you entered, your name and your message. When someone opens a tracked link,
          we count the click and record the time, approximate country and region, language and device type. The home’s owner sees these counts and the recipient
          addresses in their dashboard. If someone other than the owner shares the home, the owner sees that a share happened and its clicks.
        </li>
        <li>
          <strong>Your choice.</strong> The email form asks whether to track the link; tracking is selected by default and you can turn it off before sending.
          We record the choice you make. Untracked links still open the home but their clicks are not counted.
        </li>
        <li>
          <strong>Recipients.</strong> You must have a reasonable basis to send a home to each person you enter, and you are responsible for the message you send.
          Emails are sent from your own mail app unless we tell you otherwise; we use recipient addresses only to show you your share history and never to market to
          them. A recipient may ask us to delete their address through our <Link to="/privacy/request">privacy request page</Link>.
        </li>
      </ul>

      <h2>8. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>use the Service for a property you are not authorized to market or share, or with photographs you have no right to use;</li>
        <li>upload images of people without their consent, or content that is unlawful, defamatory, harassing, sexually explicit, or that infringes others’ rights;</li>
        <li>use the Service in a way that discriminates or expresses a preference based on a protected characteristic in violation of fair-housing laws;</li>
        <li>scrape, copy, resell or redistribute the Service, or access it by automated means except through features we provide;</li>
        <li>probe, overload, or circumvent the Service’s security, rate limits or access controls, or upload malware;</li>
        <li>reverse engineer the Service except where the law allows it.</li>
      </ul>
      <p>We may remove content or suspend accounts that violate these Terms or the law, or that put the Service or others at risk.</p>

      <h2>9. Third-party services</h2>
      <p>
        The Service relies on providers including Vercel (hosting and analytics), Neon (database and sign-in), Google (Gemini image generation and Google sign-in),
        Mapbox (maps and location search), ScraperAPI (retrieving public listing pages), Stripe (payments) and Resend (sending share emails). Their services are subject to their own terms. Signing in with Google is
        also subject to Google’s terms and privacy policy.
      </p>

      <h2 id="subscriptions">10. Plans, subscriptions and automatic renewal</h2>
      <p>
        New accounts start with a <strong>7-day free trial</strong>. After it, Sceneshare is offered on paid plans, <strong>Entry</strong> and <strong>Premium</strong>, with extra properties available to Premium accounts. The current prices, what each plan includes and its limits are shown on the{' '}
        <Link to="/plan">Plan and billing</Link> page before you subscribe.
      </p>
      <ul>
        <li>
          <strong>Automatic renewal.</strong> Each paid plan is a subscription that <strong>renews automatically</strong> at the end of each monthly or yearly period, at the
          price shown when you subscribed, and is charged to the payment method you gave, <strong>until you cancel</strong>. We will tell you before any price
          change takes effect, and you can cancel before it applies.
        </li>
        <li>
          <strong>Cancelling.</strong> You can cancel online at any time from the Plan and billing page, with no need to contact us. Cancelling stops the next
          renewal; your plan stays on until the end of the period you have paid for. After that your homes, designs and share links are kept, but you cannot add
          homes, render or send shares until you choose a plan again.
        </li>
        <li>
          <strong>Refunds.</strong> Payments are not refundable for partial periods, except where the law requires it or we decide otherwise. If something went
          wrong, contact us and we will look at it.
        </li>
        <li>
          <strong>Payments.</strong> Payments are processed by Stripe, which receives your card details directly; we never see or store your full card number. If a
          renewal payment fails, Stripe may retry it, and your plan may end if the payment cannot be collected.
        </li>
        <li>
          <strong>Limits and render credits.</strong> Each plan includes a number of homes (the trial and Entry: 2; Premium: 5). Each
          rendered image (a restyle, a clean-up or a requested change) uses one render credit; automatic retries we run to keep a room aligned do not. Each plan
          includes an allotment of credits (the trial: 50; Entry: 150 a month; Premium: 300 a month), which resets at the start of each monthly cycle and does
          not roll over. Changing plan part-way through a period is prorated by our payment provider. Premium accounts can buy <strong>extra properties</strong>, one-off
          purchases of $15 per property slot that each last 30 days and come with 30 credits that do not expire; when a slot ends, homes already added are
          kept, but no new homes can be added beyond the plan's limit. Extra credits can also be
          bought in packs; bought credits do not expire while your account is open, are used only after the monthly allotment, and are not refundable except where
          the law requires. A render that fails returns its credit.
        </li>
        <li>
          <strong>Preview and test periods.</strong> While payments are not switched on, upgrades may be offered free of charge for a stated period. No payment is
          taken, and we will ask for your consent before any paid subscription begins.
        </li>
      </ul>

      <h2>11. Privacy and data storage</h2>
      <p>
        How we collect, use, store, retain and delete personal information — and your California privacy rights — is described in our{' '}
        <Link to="/privacy">Privacy Policy</Link> and <Link to="/cookies">Cookie Notice</Link>, which are part of these Terms. Data is stored in the United States.
      </p>

      <h2>12. Ending use</h2>
      <p>
        You may stop using the Service and delete your account at any time. We may suspend or end the Service, or your access, at any time with or without notice,
        including if required by law or to protect the Service or its users. Sections 4 (license to the extent described), 5, 6 and 13–16 survive termination.
      </p>

      <h2>13. Disclaimers</h2>
      <p>
        THE SERVICE AND ALL CONTENT, IMAGES, MAPS AND DATA ARE PROVIDED “AS IS” AND “AS AVAILABLE,” WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
        MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY AND NON-INFRINGEMENT, TO THE FULLEST EXTENT PERMITTED BY LAW. WE DO NOT WARRANT THAT THE
        SERVICE WILL BE UNINTERRUPTED OR ERROR-FREE OR THAT GENERATED IMAGES WILL BE ACCURATE.
      </p>

      <h2>14. Limitation of liability</h2>
      <p>
        TO THE FULLEST EXTENT PERMITTED BY LAW, {operator.toUpperCase()} WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL OR PUNITIVE DAMAGES,
        OR FOR LOST PROFITS, LOST SALES OR LOST DATA, ARISING FROM YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM ABOUT THE SERVICE IS LIMITED TO THE
        GREATER OF THE AMOUNT YOU PAID US IN THE 12 MONTHS BEFORE THE CLAIM OR US $100. Some laws do not allow these limitations, so they may not apply to you.
      </p>

      <h2>15. Indemnity</h2>
      <p>
        You will defend and indemnify {operator} against claims, losses and expenses (including reasonable attorneys’ fees) arising from Your Content, your
        advertising or marketing of a property, or your violation of these Terms or the law.
      </p>

      <h2>16. Governing law and disputes</h2>
      <p>
        These Terms are governed by the laws of the State of California, without regard to its conflict-of-laws rules. Any dispute will be brought in the state or
        federal courts located in Orange County, California, and you and we consent to their jurisdiction, except that either party may bring an individual claim
        in small claims court. Nothing in these Terms limits rights you have under California consumer-protection law.
      </p>

      <h2>17. Changes</h2>
      <p>
        We may update these Terms. We will post the new version here with its effective date and, for material changes, notify account holders by email or in the
        Service before they take effect. Continuing to use the Service after that means you accept the updated Terms.
      </p>

      <h2>18. Contact</h2>
      <p>
        {operator}, operator of {service}. Email: <Mail />.
      </p>
    </>
  )
}

function Privacy() {
  return (
    <>
      <p>
        This Privacy Policy explains how {operator} (“{service},” “we,” “us”) collects, uses, stores, shares and deletes personal information when you use the{' '}
        {service} website and services, and the rights you have — including under the California Consumer Privacy Act as amended by the California Privacy Rights
        Act (“CCPA”) and the California Online Privacy Protection Act (“CalOPPA”). It also serves as our notice at collection.
      </p>

      <h2>1. Summary</h2>
      <ul>
        <li>We collect what we need to run accounts, save homes, make designs, show share pages, keep the Service secure, and understand how it is used.</li>
        <li>We do not sell personal information and do not “share” it for cross-context behavioral advertising. We have not done so in the past 12 months.</li>
        <li>We use no advertising or cross-site tracking cookies. Our analytics are cookieless, and you can turn them off. We honor Global Privacy Control.</li>
        <li>You can download or delete your data yourself at any time from <Link to="/account">My homes</Link>, or send a request on our <Link to="/privacy/request">privacy request page</Link>.</li>
      </ul>

      <h2>2. Information we collect</h2>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Category (CCPA)</th>
              <th scope="col">What it includes</th>
              <th scope="col">Source</th>
              <th scope="col">How long we keep it</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Identifiers</td>
              <td>Name, email address, account ID; a one-way, salted hash of your IP address (we do not store the IP address itself); random analytics visitor and session IDs (only if analytics are on).</td>
              <td>You; your browser</td>
              <td>Account data until you delete your account. IP hashes 90 days. Analytics IDs 13 months.</td>
            </tr>
            <tr>
              <td>Account login credentials (sensitive personal information)</td>
              <td>Email and password (stored only as a secure hash by our sign-in provider), or your Google account identity if you sign in with Google.</td>
              <td>You; Google (if you choose Google sign-in)</td>
              <td>Until you delete your account.</td>
            </tr>
            <tr>
              <td>Property and listing information</td>
              <td>Addresses you search, location, assessor parcel data, nearby places, listing facts and links, and your notes and change requests.</td>
              <td>You; Mapbox; county assessors; public listing pages retrieved at your direction</td>
              <td>Until you delete the home or your account.</td>
            </tr>
            <tr>
              <td>Photographs and images (audio, electronic, visual information)</td>
              <td>Photos you upload or take, listing photographs retrieved at your direction, and the images we generate from them. Photos may incidentally show people or personal items — please avoid including people.</td>
              <td>You; public listing pages; our image model</td>
              <td>Until you delete the home or your account.</td>
            </tr>
            <tr>
              <td>Internet and electronic activity</td>
              <td>Pages viewed, actions taken (for example “restyle started,” “link copied”), device type, language, referring page, error reports, and records of each request to our servers (route, time, result).</td>
              <td>Your browser; our servers</td>
              <td>Analytics events 13 months. Server request logs 90 days. Error reports 180 days. Our hosting provider’s own logs per its retention.</td>
            </tr>
            <tr>
              <td>Approximate location</td>
              <td>Country and region derived from your IP address by our hosting provider. We do not collect precise geolocation.</td>
              <td>Our hosting provider</td>
              <td>With the record it is attached to (above).</td>
            </tr>
            <tr>
              <td>Share records</td>
              <td>For each share: how it was shared, the sender’s name and message, recipient email addresses (email shares), whether tracking was on, and for tracked links each click’s time, approximate country/region, language and device type.</td>
              <td>The person sharing; the recipient’s browser when they open a tracked link</td>
              <td>Until the home or the sharer’s account is deleted, or a recipient asks us to delete their address.</td>
            </tr>
            <tr>
              <td>Terms acceptance and requests</td>
              <td>When you confirm your right to share and accept the Terms: the time, the Terms version, your account, a hashed IP address and your browser type. When someone asks a sharer to accept: the home, the time, their email address if they give it, and a hashed IP address. Until then, the sharer’s name and email are shown to people who open their link.</td>
              <td>You; the person asking</td>
              <td>For as long as your account exists (acceptance is our record of your permission), then deleted with it.</td>
            </tr>
            <tr>
              <td>Contact information you give buyers’ pages</td>
              <td>If you ask for updates about a home, your email address, language and the home it concerns.</td>
              <td>You</td>
              <td>Until you ask us to delete it, or 24 months after your last activity.</td>
            </tr>
            <tr>
              <td>Privacy requests</td>
              <td>Your request, email and our response.</td>
              <td>You</td>
              <td>24 months, as California law requires.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>We do not collect Social Security numbers, financial account information, precise geolocation, or other sensitive personal information beyond login credentials, and we do not infer characteristics about you.</p>

      <h2>3. How we use it</h2>
      <ul>
        <li>To provide the Service: create and secure your account, save homes to it, retrieve listing photographs and location information, generate designs, and show share pages.</li>
        <li>To keep the Service safe and working: authenticate requests, prevent abuse with rate limits, debug errors, and keep audit records.</li>
        <li>To understand and improve the Service: aggregate analytics about which features are used (unless you turn analytics off).</li>
        <li>To show owners their sharing activity: which shares were sent, to whom, and how many times each tracked link was clicked.</li>
        <li>To communicate with you: account emails (verification codes, password resets) and, if you asked, updates about a home.</li>
        <li>To comply with law and enforce our <Link to="/terms">Terms</Link>.</li>
      </ul>
      <p>We use login credentials only to sign you in and secure your account, which the CCPA permits without a right to limit.</p>

      <h2>4. Who we disclose it to</h2>
      <p>We disclose personal information only to service providers and contractors that process it for us under contracts limiting their use to providing their services:</p>
      <ul>
        <li><strong>Vercel</strong> — website hosting, server functions, request logs and cookieless web analytics.</li>
        <li><strong>Neon</strong> — our database (homes, images, designs, logs) and sign-in service (accounts and sessions).</li>
        <li><strong>Google</strong> — the Gemini image model (receives the photographs and instructions needed to generate each design); Google sign-in if you choose it; Google Fonts (your browser requests fonts from Google, which receives your IP address).</li>
        <li><strong>Mapbox</strong> — maps, address search and nearby places (receives the addresses you search and, from your browser, map requests).</li>
        <li><strong>ScraperAPI</strong> — retrieves public listing pages for the address you entered.</li>
        <li><strong>Stripe</strong> — payments for Sceneshare subscriptions and credit packs (receives your name, email, payment details and billing address when you subscribe).</li>
        <li><strong>Resend</strong> — sends the share emails you ask us to send (receives the recipient addresses, your name and your message), and the requests asking a sharer to accept the Terms.</li>
      </ul>
      <p>
        <strong>Share pages are public to anyone with the link.</strong> When you share a home, its address, photographs, designs and map are visible to whoever
        opens the link. We may also disclose information if required by law, to protect rights and safety, or as part of a merger or sale of the business (with
        notice to you).
      </p>

      <h2>5. Where it is stored and how it is protected</h2>
      <p>
        Data is stored in the United States by Vercel and Neon. If you visit from outside the United States, your information is transferred to and processed in
        the United States. All traffic is encrypted in transit (HTTPS). Sign-in sessions use secure, HttpOnly cookies; passwords are stored only as hashes by our
        sign-in provider; IP addresses are stored only as salted hashes; access to production systems is limited. No method of storage or transmission is
        completely secure, so we cannot guarantee absolute security.
      </p>

      <h2>6. Your California privacy rights</h2>
      <p>If you are a California resident you have the right to:</p>
      <ul>
        <li><strong>Know and access</strong> the personal information we collected about you, its categories, sources, purposes and recipients, and to receive a portable copy;</li>
        <li><strong>Delete</strong> personal information we collected from you, subject to legal exceptions;</li>
        <li><strong>Correct</strong> inaccurate personal information;</li>
        <li><strong>Opt out of sale or sharing</strong> — we do not sell or share personal information;</li>
        <li><strong>Limit the use of sensitive personal information</strong> — we use it only for purposes the CCPA permits;</li>
        <li><strong>Not be discriminated against</strong> for exercising these rights.</li>
      </ul>
      <p>
        <strong>How to exercise them.</strong> Account holders can download all their data and delete their account instantly on <Link to="/account">My homes</Link>.
        Anyone can submit a request on our <Link to="/privacy/request">privacy request page</Link> or by emailing <Mail />. We will confirm receipt within 10 business
        days and respond within 45 calendar days (we may extend once by 45 days with notice). To protect you, we verify requests by matching the email address
        on file — for example by asking you to confirm from that address. An authorized agent may submit a request with your signed permission, and we may ask you
        to verify your identity directly.
      </p>
      <p>We apply these rights to all users, not only California residents.</p>

      <h2>7. Opt-out preference signals and Do Not Track</h2>
      <p>
        We honor Global Privacy Control (GPC) and browser Do Not Track signals: when your browser sends either, our analytics are turned off automatically and our
        cookie notice says so. Because we do not sell or share personal information, these signals have no other effect.
      </p>

      <h2>8. Cookies and similar technologies</h2>
      <p>See our <Link to="/cookies">Cookie Notice</Link> for each cookie and storage item we use and how to control them.</p>

      <h2>9. Children</h2>
      <p>The Service is not directed to children and is for adults 18 and over. We do not knowingly collect personal information from anyone under 16. If you believe a child has given us information, contact us and we will delete it.</p>

      <h2>10. California “Shine the Light”</h2>
      <p>We do not disclose personal information to third parties for their own direct-marketing purposes.</p>

      <h2>11. Changes to this policy</h2>
      <p>We will post any changes here with a new effective date and, for material changes, notify account holders by email or in the Service.</p>

      <h2>12. Contact</h2>
      <p>
        {operator}, operator of {service}. Email: <Mail />. Privacy requests: <Link to="/privacy/request">privacy request page</Link>.
      </p>
    </>
  )
}

function Cookies() {
  const rows = [
    ['__Secure-neon-auth.session_token', 'Cookie (HttpOnly, Secure, first-party)', 'Keeps you signed in.', 'Essential', 'Up to 7 days, renewed while you use the site; deleted when you sign out'],
    ['__Secure-neon-auth.local.session_data', 'Cookie (HttpOnly, Secure, first-party)', 'Short-lived, signed copy of your session so pages load faster.', 'Essential', '5 minutes'],
    ['__Secure-neon-auth.session_challenge', 'Cookie (HttpOnly, Secure, first-party)', 'Protects the Google sign-in round trip.', 'Essential', '10 minutes'],
    ['ss:lang', 'Local storage', 'Remembers English or Chinese.', 'Essential (preference)', 'Until you clear it'],
    ['ss:consent', 'Local storage', 'Remembers your choice in this notice.', 'Essential', 'Until you clear it'],
    ['ss:intent, ss:email-asked', 'Session storage', 'Finishes what you started after signing in; asks for your email at most once per visit.', 'Essential', 'Until you close the tab'],
    ['ss:lead', 'Local storage', 'Remembers that you already asked for updates, so we don’t ask again.', 'Essential', 'Until you clear it'],
    ['ss:vid', 'Local storage', 'Random visitor ID for our own analytics (only if analytics are on).', 'Analytics', 'Until you clear it or turn analytics off'],
    ['ss:sid', 'Session storage', 'Random session ID for our own analytics (only if analytics are on).', 'Analytics', 'Until you close the tab'],
  ]
  return (
    <>
      <p>
        This notice explains the cookies and browser storage {service} uses. We use <strong>no advertising cookies and no cross-site tracking</strong>.
      </p>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Type</th>
              <th scope="col">Purpose</th>
              <th scope="col">Category</th>
              <th scope="col">Duration</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]}>
                {r.map((c, i) => (
                  <td key={i}>{i === 0 ? <code>{c}</code> : c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Analytics</h2>
      <p>
        We measure use in two cookieless ways: Vercel Web Analytics (page views, referrers, country and device type; Vercel identifies visits with a hash of
        request data that resets daily and sets no cookies) and our own first-party event log. Both are off if you choose “Essential only” or your browser sends
        Global Privacy Control or Do Not Track. Error reports, which carry no identifiers, are always sent so we can fix problems.
      </p>
      <h2>Third parties your browser contacts</h2>
      <ul>
        <li><strong>Mapbox</strong> serves map tiles and may count map loads for billing; it sets no cookies through our pages.</li>
        <li><strong>Google Fonts</strong> serves our typefaces; Google receives your IP address.</li>
        <li><strong>Google sign-in</strong>, if you use it, takes place on google.com under Google’s own cookies and policies.</li>
      </ul>
      <h2>Your choices</h2>
      <p>
        Use “Cookie settings” at the bottom of any page to change your choice. You can also clear or block cookies and storage in your browser; blocking the
        essential sign-in cookie will stop you from signing in.
      </p>
    </>
  )
}

const DOCS = { terms: Terms, privacy: Privacy, cookies: Cookies }

export default function Legal({ doc }) {
  const { t, lang } = useI18n()
  const Body = DOCS[doc] || Terms
  return (
    <main id="main" className="page legal">
      <p className="page__eyebrow">{service}</p>
      <h1 className="page__title">{t(`meta.${doc}`)}</h1>
      <p className="legal__date">Effective {effective} · Last updated {effective}</p>
      {lang === 'zh' && (
        <aside className="legal__zh" lang="zh-Hans">
          <h2>中文摘要</h2>
          <p>{t(`legal.zh.${doc}`)}</p>
          <p className="fine">以下为英文正式版本；如中英文有任何不一致，以英文版本为准。</p>
        </aside>
      )}
      <article className="legal__body" lang="en">
        <Body />
      </article>
      <nav className="legal__nav" aria-label={t('legal.nav')}>
        <Link to="/terms">{t('legal.terms')}</Link>
        <Link to="/privacy">{t('legal.privacy')}</Link>
        <Link to="/cookies">{t('legal.cookies')}</Link>
        <Link to="/privacy/request">{t('legal.choices')}</Link>
      </nav>
    </main>
  )
}
