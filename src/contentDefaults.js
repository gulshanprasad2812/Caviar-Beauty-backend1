/**
 * Default storefront copy.
 *
 * `scripts/seed-content.mjs` writes these into the database (upsert by slug) so
 * the admin panel has something to edit. The frontend keeps its own fallback
 * copy so a fresh install still renders before the seed runs.
 */

const page = (slug, title, subtitle, seoTitle, seoDesc, sections, extra = {}) => ({
  slug,
  title,
  subtitle,
  seoTitle,
  seoDesc,
  layout: 'article',
  sections,
  data: null,
  isPublished: true,
  ...extra,
});

const table = (columns, rows) => ({ columns, rows });

export const defaultPages = [
  page(
    'about',
    'The Caviar Beauty Legacy',
    'Our Story',
    'About',
    'Learn about the Caviar Beauty story, our values and our craftsmanship.',
    [],
    {
      layout: 'about',
      data: {
        founded: 'Founded 2024',
        imageUrl: '',
        story: [
          'Caviar Beauty was born from a vision to create the world\u2019s finest luxury accessories. Our founder, inspired by the ateliers of Paris and the craftsmanship of Italian artisans, set out to build a house that represents the pinnacle of elegance.',
          'Today, our pieces are worn by discerning clients in over 30 countries. From our flagship atelier in Milan to our boutique on Fifth Avenue, every Caviar Beauty creation carries the legacy of excellence.',
          'We believe in slow luxury \u2014 pieces that take weeks to create but last a lifetime. Our commitment to quality, sustainability, and timeless design sets us apart in the world of high fashion.',
        ],
        values: [
          { title: 'Craftsmanship', desc: 'Every piece is handcrafted by master artisans with decades of experience.' },
          { title: 'Sustainability', desc: 'Ethically sourced materials and responsible production practices.' },
          { title: 'Timeless Design', desc: 'Pieces designed to transcend seasons and trends.' },
          { title: 'Exclusivity', desc: 'Limited production runs ensure rarity and uniqueness.' },
        ],
      },
    },
  ),

  page(
    'faq',
    'Everything You Need to Know',
    'Frequently Asked Questions',
    'FAQ',
    'Answers to common questions about ordering, payments, delivery, and products at Caviar Beauty.',
    [
      {
        heading: 'Ordering & Payment',
        body: [
          'Placing an order takes less than two minutes. Add items to your bag, enter a delivery address, choose a payment method, and confirm.',
        ],
        items: [
          'What payment methods do you accept? \u2014 We accept all major credit and debit cards, UPI, net banking, and digital wallets via our secure Paytm gateway.',
          'Is checkout secure? \u2014 Yes. All payments are processed over an encrypted connection through Paytm, a PCI-DSS compliant payment provider. We never store your card details.',
          'Do you provide an invoice? \u2014 Yes. A GST-compliant invoice is available for every order. You can download it from the order detail page.',
          'Can I cancel my order? \u2014 Orders can be cancelled while they are still pending or confirmed. Once an order is shipped, it cannot be cancelled.',
        ],
      },
      {
        heading: 'Delivery',
        body: ['We deliver across India through our trusted courier partners.'],
        items: [
          'How long does delivery take? \u2014 Most orders are dispatched within 24-48 hours and delivered in 3-7 business days depending on your location.',
          'How much does shipping cost? \u2014 Shipping is \u20b999 for all orders. It is free on orders above \u20b95,000.',
          'How do I track my order? \u2014 Once your order is shipped, a tracking number appears on your order detail page. You can also check the status under My Orders in your account.',
        ],
      },
      {
        heading: 'Products & Authenticity',
        body: ['Every Caviar Beauty piece is crafted with uncompromising attention to detail.'],
        items: [
          'Are your products genuine? \u2014 Every piece is manufactured by us and authenticated at the atelier before dispatch.',
          'What is the warranty? \u2014 Each piece includes a craftsmanship warranty against manufacturing defects.',
          'Do you offer gift wrapping? \u2014 Yes, every order arrives in our signature luxury packaging at no extra cost.',
        ],
      },
    ],
  ),

  page(
    'size-guide',
    'Find Your Perfect Fit',
    'Size Guide',
    'Size Guide',
    'Handbag dimensions and footwear size conversion charts for Caviar Beauty products.',
    [
      {
        heading: 'Handbags',
        body: ['All dimensions are in centimetres (length x height x depth).'],
        items: [
          'Small \u2014 24 x 18 x 8 cm \u2014 Essentials only (phone, cardholder, lipstick)',
          'Medium \u2014 30 x 22 x 10 cm \u2014 Daily carry (wallet, sunglasses, keys)',
          'Large \u2014 38 x 28 x 14 cm \u2014 Work & travel (laptop up to 14", documents)',
        ],
      },
      {
        heading: 'Footwear',
        body: [
          'Our footwear fits true to size. Use this conversion chart to find your EU size, then check each product page for fit notes.',
        ],
        table: table(
          ['EU', 'UK', 'US', 'IN'],
          [
            ['EU 36', 'UK 3', 'US 6', 'IN 5'],
            ['EU 37', 'UK 4', 'US 7', 'IN 6'],
            ['EU 38', 'UK 5', 'US 8', 'IN 7'],
            ['EU 39', 'UK 6', 'US 9', 'IN 8'],
            ['EU 40', 'UK 7', 'US 10', 'IN 9'],
            ['EU 41', 'UK 8', 'US 11', 'IN 10'],
            ['EU 42', 'UK 9', 'US 12', 'IN 11'],
          ],
        ),
      },
      {
        heading: 'Measuring Tips',
        items: [
          'Measure your foot in the evening when it is at its largest.',
          'Stand while measuring, with your heel against a wall.',
          'For half sizes or wide feet, order one size up.',
          'For bags, check the dimensions against an item you carry daily.',
        ],
      },
    ],
  ),

  page(
    'care-instructions',
    'Caring for Your Caviar Beauty Piece',
    'Care Instructions',
    'Care Instructions',
    'How to care for your luxury leather handbags and footwear to keep them beautiful for years.',
    [
      {
        heading: 'Leather Care',
        items: [
          'Store in the dust bag provided, away from direct sunlight and heat.',
          'Use a soft, dry cloth to wipe away dust after each use.',
          'Apply a leather conditioner every 2-3 months to keep the leather supple.',
          'Keep leather away from water and liquids. If wet, blot gently and air dry naturally \u2014 never use a dryer.',
        ],
      },
      {
        heading: 'Hardware & Details',
        items: [
          'Clean metal hardware with a dry microfiber cloth to maintain its shine.',
          'Avoid contact with perfume, cosmetics, and harsh chemicals, which can discolour materials.',
          'Do not overstuff bags \u2014 this can distort their shape over time.',
        ],
      },
      {
        heading: 'Footwear',
        items: [
          'Rotate between pairs to let each pair rest between wears.',
          'Use a shoe tree or tissue paper to preserve shape when storing.',
          'Clean suede and leather with the appropriate brush or cloth only.',
          'Protect soles with a cobbler\u2019s treatment before first wear, especially for smooth-leather soles.',
        ],
      },
      {
        heading: 'General',
        items: [
          'Keep the original packaging and receipt with your order number for any warranty claims.',
          'For stubborn stains, please contact our concierge before attempting any treatment.',
        ],
      },
    ],
  ),

  page(
    'track-order',
    'Track Your Order',
    'Order Tracking',
    'Track Order',
    'Learn how to track your Caviar Beauty order and understand each order status.',
    [
      {
        heading: 'How to Track',
        items: [
          'Sign in and go to My Orders in your account dashboard.',
          'Open your order and view the live status and tracking number.',
          'Click the carrier link to see real-time delivery updates.',
          'Watch your email \u2014 we send a notification at every step, from confirmation to delivery.',
        ],
      },
      {
        heading: 'Understanding Order Statuses',
        items: [
          'Pending \u2014 We have received your order and are confirming payment.',
          'Confirmed \u2014 Payment is verified and your order is being prepared.',
          'Shipped \u2014 Your order is on its way. The tracking number is now available.',
          'Delivered \u2014 Your order has been delivered. Enjoy!',
          'Cancelled \u2014 The order was cancelled before dispatch. Any amount paid is refunded to your original payment method.',
        ],
      },
      {
        heading: 'Need Help?',
        body: [
          'If you cannot find your tracking number or your order has not updated for a while, our concierge is here to help.',
        ],
        items: ['Email: hello@caviarbeauty.com', 'We reply within 24 hours.'],
      },
    ],
  ),

  page(
    'privacy-policy',
    'Privacy Policy',
    'Your Data',
    'Privacy Policy',
    'What data Caviar Beauty collects, why we collect it, and the choices you have.',
    [
      {
        heading: 'What We Collect',
        body: ['We only collect what we need to sell you a product and support you afterwards.'],
        items: [
          'Account details: first and last name, email address, phone number, and a bcrypt hash of your password. Plain-text passwords are never stored or logged.',
          'Order details: delivery and billing addresses, the items you bought, order totals, and status history.',
          'Payment confirmations: the Paytm order id, transaction id, amount, and status returned by the gateway. Card numbers, CVVs and UPI credentials never reach our servers.',
          'Messages you send us through the contact form, newsletter sign-up, or support email.',
        ],
      },
      {
        heading: 'Cookies and Local Storage',
        body: [
          'We use a small number of first-party cookies to keep you signed in and to protect forms. The cookie policy page lists each one.',
        ],
      },
      {
        heading: 'How We Use Data',
        items: [
          'To create and deliver your order, including passing the delivery address to our courier.',
          'To verify payments with Paytm and issue invoices and refunds.',
          'To send transactional email such as order confirmations and one-time verification codes.',
          'To detect fraud and abuse, and to keep the service secure.',
          'To answer support requests. We do not sell personal data or use it for third-party advertising.',
        ],
      },
      {
        heading: 'Who We Share It With',
        items: [
          'Paytm \u2014 payment processing and refunds.',
          'Our courier partners \u2014 name, address and phone number for delivery only.',
          'Our database and hosting providers \u2014 to run the store.',
          'Our email provider \u2014 to deliver transactional messages.',
          'Authorities where we are legally required to do so.',
        ],
      },
      {
        heading: 'Retention and Your Rights',
        body: [
          'Account data is kept while your account is open. Order records are kept for as long as tax and accounting rules require. You can ask us to access, correct, export or delete your data by writing to the support address below.',
        ],
      },
      {
        heading: 'Security',
        items: [
          'Passwords are hashed with bcrypt and never returned by the API.',
          'Sessions use httpOnly cookies, short-lived access tokens and rotating refresh tokens.',
          'Database queries are parameterised through Prisma, and authentication endpoints are rate limited.',
        ],
      },
      {
        heading: 'Contact',
        items: ['Email: hello@caviarbeauty.com', 'We reply within 24 hours.'],
      },
    ],
  ),

  page(
    'terms-of-service',
    'Terms of Service',
    'The Fine Print',
    'Terms of Service',
    'The terms that apply when you browse or buy from Caviar Beauty.',
    [
      {
        heading: 'Using This Store',
        body: [
          'By browsing or placing an order you agree to these terms. You must be able to enter a binding contract and provide accurate account and delivery information.',
        ],
        items: [
          'Keep your password private and tell us immediately if you think it has been compromised.',
          'Do not attempt to disrupt the store, scrape it at scale, or use it for fraudulent payments.',
        ],
      },
      {
        heading: 'Products and Pricing',
        items: [
          'All prices are shown in Indian Rupees (INR) and include 18% GST.',
          'Product images are illustrative; natural materials can vary slightly between pieces.',
          'We may correct pricing errors before dispatch and will cancel and refund the affected order if you do not accept the corrected price.',
        ],
      },
      {
        heading: 'Orders and Payment',
        items: [
          'An order is only accepted once payment is verified with Paytm and the order status becomes Confirmed.',
          'Payments are processed by Paytm. We never see or store your card or UPI credentials.',
          'We may cancel an order if the item is unavailable, the payment fails, or we suspect fraud. Any captured amount is refunded to the original payment method.',
        ],
      },
      {
        heading: 'Shipping, Cancellation and Returns',
        items: [
          'Orders are dispatched within 24-48 hours and normally delivered in 3-7 business days.',
          'Shipping is \u20b999, and free on orders above \u20b95,000.',
          'You can cancel before your order ships from your account or by contacting support.',
          'Returns are accepted within 7 days of delivery for unused items in their original packaging. Contact support to start a return.',
        ],
      },
      {
        heading: 'Liability',
        body: [
          'Nothing in these terms limits rights you have under applicable consumer law. Otherwise, our liability for any order is limited to the amount you paid for that order.',
        ],
      },
      {
        heading: 'Changes and Contact',
        body: [
          'We may update these terms; the revised version applies from the date it is published on this page.',
        ],
        items: ['Email: hello@caviarbeauty.com'],
      },
    ],
  ),

  page(
    'cookie-policy',
    'Cookie Policy',
    'Cookies',
    'Cookie Policy',
    'The first-party cookies Caviar Beauty uses, what each one does, and how to control them.',
    [
      {
        heading: 'Cookies We Set',
        body: [
          'We use only first-party cookies that are required to sign you in and to protect forms. We do not run advertising or cross-site tracking cookies.',
        ],
        table: table(
          ['Cookie', 'Purpose', 'Lifetime'],
          [
            ['token', 'Signed-in session (httpOnly)', '7 days'],
            ['refreshToken', 'Rotates the session without asking for your password (httpOnly, scoped to the refresh endpoint)', '30 days'],
            ['csrfToken', 'Double-submit token that blocks cross-site form posts', '7 days'],
          ],
        ),
      },
      {
        heading: 'What We Store in Your Browser',
        body: [
          'Your bag, wishlist and light/dark theme are kept in browser local storage so they survive a page reload. Clearing site data removes them.',
        ],
      },
      {
        heading: 'Third Parties',
        body: [
          'Paytm Checkout runs on Paytm\u2019s own domain and may set its own cookies during payment. Those cookies are controlled by Paytm, not by us, and are only present while you are paying.',
        ],
      },
      {
        heading: 'Managing Cookies',
        items: [
          'You can delete or block cookies in your browser settings.',
          'Blocking the session cookies means you cannot sign in, add items to a bag while signed in, or complete checkout.',
          'Clearing site data removes your local bag and wishlist.',
        ],
      },
      {
        heading: 'Contact',
        items: ['Questions about cookies: hello@caviarbeauty.com'],
      },
    ],
  ),

  page(
    'gdpr-compliance',
    'GDPR Compliance',
    'Data Protection',
    'GDPR Compliance',
    'How Caviar Beauty approaches GDPR rights for visitors in the European Economic Area.',
    [
      {
        heading: 'Scope',
        body: [
          'This page explains how we handle personal data for visitors and customers in the European Economic Area (EEA) and the United Kingdom. It complements the privacy policy.',
        ],
      },
      {
        heading: 'Lawful Bases',
        items: [
          'Contract \u2014 creating your account, fulfilling orders, and providing support.',
          'Legitimate interests \u2014 keeping the store secure, preventing fraud, and fixing errors.',
          'Consent \u2014 newsletter email, which you can withdraw at any time using the unsubscribe link.',
          'Legal obligation \u2014 retaining invoices and tax records.',
        ],
      },
      {
        heading: 'Your Rights',
        items: [
          'Access a copy of the personal data we hold about you.',
          'Correct inaccurate data and complete incomplete data.',
          'Erase your data where we no longer need it and no legal obligation requires us to keep it.',
          'Restrict or object to processing, and receive your data in a portable format.',
          'Lodge a complaint with your local supervisory authority.',
        ],
      },
      {
        heading: 'International Transfers',
        body: [
          'Our database and application hosting are provided by suppliers that store data outside the EEA. We use providers that offer appropriate safeguards for those transfers.',
        ],
      },
      {
        heading: 'Exercising Your Rights',
        body: [
          'Write to the support address below and tell us which right you want to exercise. We may need to confirm your identity before acting, and we respond within 30 days.',
        ],
        items: ['Email: hello@caviarbeauty.com'],
      },
    ],
  ),
];

export const defaultSiteSettings = {
  brandName: 'Caviar Beauty',
  tagline: 'Timeless luxury, handcrafted',
  supportEmail: 'hello@caviarbeauty.com',
  supportPhone: '+1 (555) 123-4567',
  whatsapp: '',
  address: '725 Fifth Avenue, New York, NY 10022',
  hours: 'Open daily 10AM - 8PM',
  instagramUrl: '',
  twitterUrl: '',
  linkedinUrl: '',
  youtubeUrl: '',
  footerBlurb:
    'Crafting timeless luxury since 2024. Each piece is a testament to extraordinary craftsmanship and uncompromising quality.',
  announcement: 'Complimentary shipping on orders above \u20b95,000',
  announcementEnabled: false,
  heroSlides: [
    {
      title: 'Timeless Elegance',
      subtitle: 'Discover the new collection',
      cta: 'Shop Now',
      ctaHref: '/products',
      cta2: 'Explore Collection',
      cta2Href: '/collections',
    },
    {
      title: 'Luxury Redefined',
      subtitle: 'Handcrafted perfection',
      cta: 'Discover',
      ctaHref: '/products',
      cta2: 'View Lookbook',
      cta2Href: '/collections',
    },
    {
      title: 'The Art of Style',
      subtitle: 'Where craftsmanship meets design',
      cta: 'Explore',
      ctaHref: '/products',
      cta2: 'Our Story',
      cta2Href: '/about',
    },
  ],
};

export const RESERVED_PAGE_SLUGS = new Set([
  'about', 'faq', 'size-guide', 'care-instructions', 'track-order',
  'privacy-policy', 'terms-of-service', 'cookie-policy', 'gdpr-compliance',
]);
