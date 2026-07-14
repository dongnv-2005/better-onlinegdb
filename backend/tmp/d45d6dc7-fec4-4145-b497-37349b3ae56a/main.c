#include <stdio.h>
 
int factorial(int n)
{
  if (n == 1) 
    return 1;
  else return factorial(n-1)*n;
}
int main()
{
    int n = 5;
    int result = factorial(n);
    printf("%d", result);
}