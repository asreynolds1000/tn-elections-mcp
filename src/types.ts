// ============================================================
// EasyVote Campaign Finance (county-level)
// ============================================================

/** Auth context returned by bootstrap endpoint */
export interface EasyVoteAuthContext {
  UserId: string
  CustomerId: string
  ZumoToken: null
}

/** Filer document from documentsearch endpoint */
export interface EasyVoteDocument {
  documentnameid: [string, string] | null
  documentid: string
  documentname: string
  datesubmitted: string  // MM/DD/YY format
  documenttype: string
  electionname: string | null
}

/** Filer from documentsearch endpoint */
export interface EasyVoteFiler {
  filerid: string
  firstname: string
  middlename: string | null
  lastname: string
  committeename: string
  filertype: string  // "Candidate", "Candidate/Challenger"
  status: string     // "Active"
  displayname: string
  officename: string
  imgurl: string | null
  documents: EasyVoteDocument[]
}

/** Office from offices endpoint */
export interface EasyVoteOffice {
  guid: string
  name: string
}

/** Contribution record from advancedsearch endpoint (34 fields) */
export interface EasyVoteContribution {
  DocumentFilingId: string
  DocumentId: string | null
  DocumentType: string           // "CFD"
  ItemizedListType: string       // "Contribution", "(In-Kind) Contribution", "Loan"
  RecipientFirstName: string
  RecipientMiddleInitial: string | null
  RecipientLastName: string
  RecipientCommitteeName: string
  OfficeGuid: string
  OfficeName: string
  ContributorFullName: string | null
  ContributorFirstName: string
  ContributorMiddleName: string | null
  ContributorLastName: string
  ContributorOrganizationName: string | null
  ContributorAddress: string
  ContributorCity: string
  ContributorState: string
  ContributorZip: string
  ContributionDate: string       // ISO date "YYYY-MM-DD"
  ContributionAmount: number
  ContributionDateDate: string   // .NET ticks "/Date(...)/"
  CustomSearchResultFields: unknown | null
}

/** Distribution/expenditure record from advancedsearch/distributions endpoint */
export interface EasyVoteDistribution {
  DocumentFilingId: string
  DocumentType: string           // "CFD"
  ItemizedListType: string       // "Expenditure"
  CandidateFirstName: string
  CandidateMiddleInitial: string | null
  CandidateLastName: string
  CandidateCommitteeName: string
  OfficeGuid: string
  OfficeName: string
  PayeeFirstName: string | null
  PayeeLastName: string
  PayeeOrganizationName: string | null
  PayeeAddress: string
  PayeeCity: string
  PayeeState: string
  PayeeZip: string
  DistributionDate: string | null   // may be null
  DistributionAmount: number
  DistributionDateDate: string | null
  CustomSearchResultFields: unknown | null
}

// ============================================================
// tncamp (state-level campaign finance) — Phase 2
// ============================================================

/** Candidate/PAC from cpsearch results */
export interface TncampCandidate {
  name: string
  party: string
  officeSought: string
  district: string
  electionYear: string
  candidateId: number
  reportListUrl: string
}

/** Report entry from replist.htm */
export interface TncampReport {
  election: string
  reportName: string
  isAmendment: boolean
  submittedOn: string
  reportId: number
  reportUrl: string
}

/** Line item in a report's itemized section (receipts, disbursements, loans) */
export interface TncampLineItem {
  name: string
  address: string
  date: string
  amount: number
  employer?: string
  occupation?: string
  purpose?: string
}

/** Full parsed report from report_full.htm */
export interface TncampReportDetail {
  reportId: number
  candidateName: string
  reportTitle: string
  beginningBalance: number
  totalContributions: number
  totalReceipts: number
  totalExpenditures: number
  totalDisbursements: number
  endingBalance: number
  totalOutstandingLoans: number
  receipts: TncampLineItem[]
  disbursements: TncampLineItem[]
  inKindContributions: TncampLineItem[]
  loans: TncampLineItem[]
  obligations: TncampLineItem[]
}

/** Contribution from cesearch results */
export interface TncampContribution {
  type: string
  amount: number
  date: string
  electionYear: string
  recipientName: string
  contributorName: string
  contributorAddress: string
  contributorOccupation: string
  contributorEmployer: string
}

/** Expenditure from cesearch results */
export interface TncampExpenditure {
  type: string
  amount: number
  date: string
  vendorName: string
  vendorAddress: string
  purpose: string
  candidateFor: string
}

/** Pagination metadata from DisplayTag results pages */
export interface TncampPaginationInfo {
  totalItems: number
  currentPage: number
  totalPages: number
  itemsPerPage: number
  paginationParam: string
}

// ============================================================
// Sumner County Campaign Finance (votesumnertn.org PDFs)
// ============================================================

export interface SumnerElectionCycle {
  year: string
  url: string
  label: string
}

export interface SumnerOffice {
  name: string
  district?: string
  isMunicipal: boolean
  municipality?: string
}

export interface SumnerReportLink {
  reportName: string
  pdfUrl: string
}

export interface SumnerCandidate {
  name: string
  office: SumnerOffice
  reports: SumnerReportLink[]
  cycle: string
}

export interface SumnerNonDisclosure {
  name: string
  cycle: string
}

export interface SumnerCyclePage {
  cycle: SumnerElectionCycle
  candidates: SumnerCandidate[]
  nonDisclosures: SumnerNonDisclosure[]
  scrapedAt: string
}

export interface SumnerContribution {
  date: string
  name: string
  address: string
  amount: number
  type: string
  employer?: string
  occupation?: string
}

export interface SumnerExpenditure {
  date: string
  payee: string
  address: string
  amount: number
  purpose?: string
}

export interface SumnerReportData {
  candidateName: string
  officeSought: string
  reportPeriod: string
  beginningBalance: number
  totalContributions: number
  totalExpenditures: number
  endingBalance: number
  contributions: SumnerContribution[]
  expenditures: SumnerExpenditure[]
  extractionModel: string
  extractionConfidence: 'high' | 'medium' | 'low'
  warnings: string[]
}
