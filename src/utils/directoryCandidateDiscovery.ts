import type {
  BusinessProfile,
  DirectoryAuditRow,
  DirectoryCheckMethod,
  DirectorySuggestion,
  DirectoryType,
} from '../types/audit'
import type { DirectoryCandidateResponse } from '../types/directoryCandidates'

const splitList = (value: string) =>
  value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)

export const websiteDomain = (website: string) => {
  try {
    return new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`)
      .hostname.replace(/^www\./i, '')
  } catch {
    return website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]
  }
}

export const expectedDirectoryDomain = (directoryName: string) => {
  const name = directoryName.toLowerCase()
  if (name.includes('weddingwire')) return 'weddingwire.com'
  if (name.includes('the knot')) return 'theknot.com'
  if (name.includes('zola')) return 'zola.com'
  if (name.includes('greatschools')) return 'greatschools.org'
  if (name.includes('niche')) return 'niche.com'
  if (name.includes('private school review')) return 'privateschoolreview.com'
  if (name.includes('booksy')) return 'booksy.com'
  if (name.includes('vagaro')) return 'vagaro.com'
  if (name.includes('fresha')) return 'fresha.com'
  if (name.includes('styleseat')) return 'styleseat.com'
  if (name.includes('angi')) return 'angi.com'
  if (name.includes('homeadvisor')) return 'homeadvisor.com'
  if (name.includes('thumbtack')) return 'thumbtack.com'
  if (name.includes('houzz')) return 'houzz.com'
  if (name.includes('bbb')) return 'bbb.org'
  return ''
}

export const discoverDirectoryCandidateUrls = async (
  profile: BusinessProfile,
  directory:
    | Pick<
        DirectoryAuditRow,
        'directoryName' | 'directoryType' | 'checkMethod'
      >
    | Pick<
        DirectorySuggestion,
        'directoryName' | 'directoryType' | 'checkMethod'
      >,
) => {
  const response = await fetch('/api/directory-candidates', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      businessName: profile.businessName,
      websiteDomain: websiteDomain(profile.website),
      localMarket: profile.localMarket || profile.targetLocation || profile.serviceArea,
      state: '',
      primaryCategory: profile.primaryCategory,
      serviceTags: [
        ...splitList(profile.primaryServices),
        ...splitList(profile.industryTags),
        ...splitList(profile.secondaryCategories),
      ],
      directoryName: directory.directoryName,
      expectedDirectoryDomain: expectedDirectoryDomain(directory.directoryName),
      directoryType: directory.directoryType as DirectoryType,
      checkMethod: directory.checkMethod as DirectoryCheckMethod,
      existingDirectoryUrls: profile.existingDirectoryUrls,
    }),
  })

  const payload = (await response.json()) as DirectoryCandidateResponse | {
    error: string
  }
  if (!response.ok) {
    throw new Error(
      'error' in payload ? payload.error : 'Directory candidate lookup failed.',
    )
  }

  return payload as DirectoryCandidateResponse
}
