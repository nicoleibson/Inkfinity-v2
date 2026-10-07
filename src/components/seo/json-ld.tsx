import Script from 'next/script'

export function JsonLd() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://inkfinity-ten.vercel.app'
  
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Inkfinity',
    url: baseUrl,
    logo: `${baseUrl}/icon-512x512.png`,
    description: 'Plataforma marketplace y comunidad para artistas del tatuaje',
    sameAs: [],
  }

  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Inkfinity',
    url: baseUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${baseUrl}/marketplace?search={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }

  return (
    <>
      <Script
        id="organization-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <Script
        id="website-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }}
      />
    </>
  )
}
