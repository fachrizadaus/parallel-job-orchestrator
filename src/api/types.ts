/**
 * api/types.ts
 *
 * Request/response shapes for each CloudStack command. 
 * Pass the matching interface explicitly when calling callApi(), 
 * e.g.: callApi<JobIdResponse>("createVpc", params) where `params` is typed as CreateVpcParams.
 */

export interface JobIdResponse {
  jobid: string;
}

export interface JobResultResponse {
  jobresult: Record<string, any>;
  jobid: string;
  jobstatus: 0 | 1 | 2; // 0 = processing, 1 = success, 2 = error
}

export interface CreateVpcParams {
  name: string;
  cidr: string;
  [k: string]: any;
}

export interface CreateNetworkParams {
  vpcid: string;
  name: string;
  gateway: string;
  netmask: string;
  [k: string]: any;
}

export interface CreateNetworkResponse {
  network: { id: string;[k: string]: any };
}

export interface CreateNetworkACLListParams {
  vpcid: string;
  name: string;
  [k: string]: any;
}

export interface CreateNetworkACLParams {
  aclid: string;
  protocol: string;
  [k: string]: any;
}

export interface ReplaceNetworkACLListParams {
  aclid: string;
  networkid: string;
  [k: string]: any;
}

export interface DeployVirtualMachineParams {
  networkids: string;
  serviceofferingid: string;
  templateid: string;
  [k: string]: any;
}

export interface DeleteVpcParams {
  id: string;
  [k: string]: any;
}

export interface DeleteNetworkParams {
  id: string;
  [k: string]: any;
}

export interface DestroyVirtualMachineParams {
  id: string;
  [k: string]: any;
}

export interface DisassociateIpAddressParams {
  id: string;
  [k: string]: any;
}

export interface ListPublicIpAddressesResponse {
  publicipaddress: Array<{ id: string; ipaddress: string; state: string;[k: string]: any }>;
}

export interface EnableStaticNatParams {
  networkid: string;
  ipaddressid: string;
  virtualmachineid: string;
  [k: string]: any;
}

export interface EnableStaticNatResponse {
  success: boolean;
}
