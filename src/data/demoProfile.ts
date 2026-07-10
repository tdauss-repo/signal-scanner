import type { BusinessProfile } from '../types/audit'

export const defaultProfile: BusinessProfile = {
  businessName: 'JEM Photography',
  website: 'https://www.jemcamera.com',
  phone: '419.410.4974',
  phoneNumbers: [
    {
      id: 'jem-jen-phone',
      number: '419.356.7554',
      label: 'Jen',
      role: 'Co-owner / photographer',
      publicUse: 'New inquiries + established clients',
      notes: 'Valid co-owner mobile number.',
      isValidPublicContact: true,
    },
    {
      id: 'jem-em-phone',
      number: '419.410.4974',
      label: 'Em',
      role: 'Co-owner / photographer',
      publicUse: 'New inquiries + established clients',
      notes: 'Valid co-owner mobile number.',
      isPrimaryForListings: true,
      isValidPublicContact: true,
    },
  ],
  contactStructureNote:
    'JEM Photography is a two-owner business. Both listed mobile numbers are valid public contact numbers. There is no single central business line. New inquiries may contact either owner; established clients may contact the owner they are working with.',
  primaryCategory: 'Photography studio',
  secondaryCategories: 'Wedding photographer, Portrait photographer',
  industryTags:
    'Wedding photography, senior pictures, business portraits, family photography, branding photography',
  localMarket: 'Sylvania, OH',
  existingDirectoryUrls: '',
  serviceArea: 'Sylvania, Toledo, Northwest Ohio, Southeast Michigan',
  primaryServices:
    'wedding photographer, senior pictures, business portraits, branding photography, family photographer',
  targetLocation: 'Sylvania OH',
  keywords:
    'wedding photographer Sylvania OH\nsenior pictures Sylvania OH\nbusiness portraits Sylvania OH\nbranding photographer Toledo\nfamily photographer Sylvania OH\nJEM Photography\nJEM Photography Sylvania',
}
