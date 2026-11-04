export const services = {
 residential: { title: 'Residential Electrical', eyebrow: 'HOMES & RENOVATIONS', intro: 'Electrical solutions designed around the way you live.', details: ['Renovation and new-build electrical planning', 'Power points, switches and fittings', 'Indoor and outdoor lighting', 'Fault finding and electrical maintenance'] },
 commercial: { title: 'Commercial Electrical', eyebrow: 'BUSINESS & FIT-OUTS', intro: 'Practical electrical support for workplaces and commercial spaces.', details: ['Commercial fit-outs and alterations', 'Lighting upgrades and installations', 'Electrical maintenance', 'Planning for evolving business needs'] },
 lighting: { title: 'Lighting & Design', eyebrow: 'LIGHTING SOLUTIONS', intro: 'Thoughtful lighting that brings your spaces to life.', details: ['Interior lighting', 'Outdoor and landscape lighting', 'Feature and architectural lighting', 'Lighting upgrades and replacements'] },
 maintenance: { title: 'Electrical Maintenance', eyebrow: 'REPAIRS & UPKEEP', intro: 'Clear, considered help when electrical work needs attention.', details: ['Fault investigation', 'Repairs and replacements', 'General electrical upkeep', 'Residential and commercial maintenance'] }
} as const;
export type ServiceKey = keyof typeof services;
